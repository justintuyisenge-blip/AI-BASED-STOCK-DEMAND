/**
 * ============================================================================
 * SUPABASE EDGE FUNCTION: ai-insights
 * ============================================================================
 *
 * WHAT THIS FUNCTION DOES & WHY THE LLM ONLY RECEIVES SUMMARISED DATA:
 * --------------------------------------------------------------------
 * 1. Purpose:
 *    Generates an executive inventory summary and 3-5 actionable RWF restocking
 *    and margin recommendations for the supermarket manager, and persists the
 *    generated insight in `public.ai_insights`.
 *
 * 2. Why the language model only receives pre-computed summarised data:
 *    - Zero Hallucinated Math: Large language models are probabilistic text
 *      generators, not calculators. All quantitative metrics (7-day & 30-day
 *      forecasts, WAPE accuracy, RWF revenue/profit, stock-out dates, and
 *      suggested reorder quantities) are computed deterministically by the
 *      database and the Ridge Regression forecast engine on the server via
 *      the shared `buildSupermarketSummary` helper (`_shared/summary.ts`).
 *    - Token & Rate-Limit Efficiency: Sending thousands of raw daily sales rows
 *      would exceed context windows and waste quota. Instead, the server builds
 *      a compact, structured JSON summary (totals, top 10 products by profit,
 *      alerts sorted in Dashboard urgency order, and 7d/30d category totals).
 *    - Cache Guard: If the latest saved insight in `ai_insights` is already
 *      newer than the latest forecast run, this function returns the saved
 *      insight immediately without calling OpenRouter—unless the manager
 *      explicitly clicked "Refresh insight" (`force_refresh: true`).
 * ============================================================================
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { buildSupermarketSummary } from '../_shared/summary.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables in Edge Function.');
    }

    // 1. Verify caller's JWT and confirm role === 'manager'
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired authentication token.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'manager') {
      return new Response(
        JSON.stringify({
          error: 'Forbidden: only managers can access AI insights.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let forceRefresh = false;
    try {
      const body = await req.json();
      forceRefresh = Boolean(body?.force_refresh);
    } catch {
      forceRefresh = false;
    }

    // 2. Check the latest forecast run and the latest saved insight
    const { data: latestForecastCheck } = await adminClient
      .from('forecasts')
      .select('run_id, generated_at')
      .not('run_id', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestForecastCheck?.run_id) {
      return new Response(
        JSON.stringify({
          error:
            'No forecast run found. Please run the forecast engine first before generating AI insights.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: latestInsight } = await adminClient
      .from('ai_insights')
      .select('id, content, generated_at')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If the latest insight is newer than the latest forecast run and not force_refresh, return cached
    if (
      !forceRefresh &&
      latestInsight &&
      new Date(latestInsight.generated_at).getTime() >=
        new Date(latestForecastCheck.generated_at).getTime()
    ) {
      return new Response(
        JSON.stringify({
          insight: latestInsight,
          cached: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Read OpenRouter secrets (never hard-coded)
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    const openRouterModel = Deno.env.get('OPENROUTER_MODEL');

    if (!openRouterApiKey || !openRouterModel) {
      return new Response(
        JSON.stringify({
          error:
            'OpenRouter secrets (OPENROUTER_API_KEY and OPENROUTER_MODEL) are not configured on the server.',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Build shared compact JSON summary (identical to ai-assistant)
    const { summary: compactSummary } = await buildSupermarketSummary(
      adminClient
    );

    const systemPrompt = `You are an inventory analyst for a supermarket in Rwanda.
STRICT RULES:
1. Use ONLY the numbers provided in the JSON data summary; do not invent figures and never state a number that is not in the data.
2. All monetary amounts are in Rwandan Francs (RWF, whole numbers).
3. Cover the top 5 urgent alerts (from top_5_urgent_alerts_dashboard_order) FIRST, using the exact product names, stock levels, stock-out dates, and suggested reorder quantities provided.
4. Use alert labels ("Stock-out risk", "Low stock", "Overstock", "Slow mover") exactly as given.
5. Never recommend reordering and reducing orders for the same product.
6. Review expiry_overview.expired_and_expiring_soon_top_10_by_cost: suggest clearance promotions or discounts for items expiring soon (and write-offs for already expired batches) using only the exact units, dates, and RWF cost values provided.
7. Write a short summary followed by 3-5 specific, actionable recommendations (what to restock, what expiring items to discount or clear, what to slow down, what to watch), in plain English.`;

    // 5. Call OpenRouter with request timeout and max_tokens
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let openRouterResponse: Response;
    try {
      openRouterResponse = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': supabaseUrl,
            'X-Title': 'Supermarket Stock Demand and Profit Prediction System',
          },
          body: JSON.stringify({
            model: openRouterModel,
            max_tokens: 700,
            temperature: 0.2,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Here is the supermarket's latest verified database and forecast summary JSON:\n\n${JSON.stringify(
                  compactSummary,
                  null,
                  2
                )}`,
              },
            ],
          }),
          signal: controller.signal,
        }
      );
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const isTimeout =
        fetchErr instanceof Error && fetchErr.name === 'AbortError';
      return new Response(
        JSON.stringify({
          error: isTimeout
            ? 'The AI service timed out while generating the insight. Please try again shortly.'
            : 'Could not reach OpenRouter. Please check your network or try again.',
        }),
        {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (openRouterResponse.status === 429) {
      return new Response(
        JSON.stringify({
          error:
            'AI rate limit reached (HTTP 429). Showing the previous saved insight; please wait a moment before refreshing.',
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!openRouterResponse.ok) {
      return new Response(
        JSON.stringify({
          error: `AI model is temporarily unavailable (HTTP ${openRouterResponse.status}). Please try again later.`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const completionJson = await openRouterResponse.json();
    const content: string =
      completionJson?.choices?.[0]?.message?.content?.trim() || '';

    if (!content) {
      return new Response(
        JSON.stringify({
          error:
            'The AI model returned an empty response. Keeping your previous saved insight.',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 6. Save generated insight to public.ai_insights
    const { data: savedInsight, error: saveError } = await adminClient
      .from('ai_insights')
      .insert({ content })
      .select('id, content, generated_at')
      .single();

    if (saveError || !savedInsight) {
      throw new Error(`Failed to save AI insight: ${saveError?.message}`);
    }

    return new Response(
      JSON.stringify({
        insight: savedInsight,
        cached: false,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server error.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
