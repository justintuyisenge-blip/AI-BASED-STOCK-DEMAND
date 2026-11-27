/**
 * ============================================================================
 * SUPABASE EDGE FUNCTION: ai-assistant
 * ============================================================================
 *
 * WHAT THIS FUNCTION DOES & WHY THE LLM ONLY RECEIVES SUMMARISED DATA:
 * --------------------------------------------------------------------
 * 1. Purpose:
 *    Powers the interactive Manager Q&A Assistant. It receives the manager's
 *    question plus the last few conversation turns from the browser, attaches
 *    the exact same server-computed JSON summary used by `ai-insights` (via
 *    `_shared/summary.ts`), and queries OpenRouter for a grounded answer.
 *
 * 2. Why the language model only receives pre-computed summarised data:
 *    - Factual Grounding: All stock counts, RWF costs/prices, 7-day and 30-day
 *      demand & profit forecasts per product and per category, WAPE scores,
 *      overstock alerts (product, stock, days of stock), slow movers, and
 *      stock-out alerts with dates and reorder quantities are calculated
 *      deterministically on the server before the LLM is called.
 *    - No Hallucinated Figures: The system prompt strictly instructs the LLM
 *      to rely exclusively on the provided JSON summary, use alert labels
 *      exactly as given, never recommend reordering and reducing orders for
 *      the same product, and never state a number that is not in the data.
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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
          error: 'Forbidden: only managers can use the AI Assistant.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Parse question and recent conversation history
    const body = await req.json();
    const question = (body?.question || '').trim();
    const rawHistory: ChatMessage[] = Array.isArray(body?.history)
      ? body.history
      : [];

    if (!question) {
      return new Response(
        JSON.stringify({ error: 'Please enter a question.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const recentHistory = rawHistory
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0
      )
      .slice(-6);

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

    // 4. Build the exact same full summary as ai-insights using shared helper
    const { summary: compactSummary } = await buildSupermarketSummary(
      adminClient
    );

    const systemPrompt = `You are an inventory analyst assistant for a supermarket in Rwanda.
STRICT RULES:
1. Use ONLY the numbers provided in the server data summary below; do not invent figures and never state a number that is not in the data.
2. If the provided data does not answer the question, explicitly say so.
3. Use alert labels ("Stock-out risk", "Low stock", "Overstock", "Slow mover") exactly as given.
4. Never recommend reordering and reducing orders for the same product.
5. When discussing urgent restocking or alerts, prioritise the top 5 urgent alerts (top_5_urgent_alerts_dashboard_order) first using the exact product names, stock levels, stock-out dates, and suggested reorder quantities provided.
6. When discussing expiring or expired stock (expiry_overview), suggest clearance or discounts for items expiring soon (and write-offs for already expired batches) using only the numbers provided.
7. Format all money in Rwandan Francs as whole numbers like "RWF 12,500".

VERIFIED SUPERMARKET DATA SUMMARY (JSON):
${JSON.stringify(compactSummary, null, 2)}`;

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
              ...recentHistory,
              { role: 'user', content: question },
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
            ? 'The AI service timed out while answering your question. Please try again.'
            : 'Could not reach OpenRouter. Please check your connection and try again.',
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
            'AI rate limit reached (HTTP 429). Please wait a few seconds and ask again.',
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
          error: `AI model is temporarily unavailable (HTTP ${openRouterResponse.status}). Please try again shortly.`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const completionJson = await openRouterResponse.json();
    const answer: string =
      completionJson?.choices?.[0]?.message?.content?.trim() || '';

    if (!answer) {
      return new Response(
        JSON.stringify({
          error: 'The AI model returned an empty reply. Please try again.',
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server error.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
