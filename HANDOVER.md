# Handover Guide — Supermarket Stock Demand and Profit Prediction System

## 1. Project Overview
A web application built for a supermarket in Rwanda to manage product inventory, sales, supplier deliveries, perishable batch expiry dates, 30-day machine learning demand and profit forecasting, stock alerts, and AI-assisted inventory recommendations.

- **Stack:** React + Vite + TypeScript, Supabase (PostgreSQL, Auth, Row Level Security, Edge Functions), Recharts, React Markdown, OpenRouter API.
- **Currency:** All monetary values are stored and displayed in Rwandan Francs (RWF) as whole numbers (for example, `RWF 12,500`).
- **Core Principle:** Every number (stock, sellable stock, RWF costs/prices, 7-day and 30-day demand and profit predictions, WAPE accuracy, stock-out dates, reorder quantities, and expiry losses) is computed deterministically by PostgreSQL and the Ridge Regression forecast engine. The language model only explains and advises using those pre-computed summaries.

---

## 2. Routes

### Public Routes
- `/` — **Landing Page**: Overview of the system, sample dashboard preview (`Sample data`), core features, 4-step workflow, Manager vs Clerk role comparison, and navigation to `/login` (or `/dashboard` when already signed in).
- `/login` — **Login Page**: Email and password sign-in with Supabase Auth, link to `/forgot-password`, and automatic redirect to `/dashboard` when already authenticated.
- `/forgot-password` — **Forgot Password Page**: Sends a Supabase password reset email with a 60-second cooldown and consistent privacy-preserving confirmation message.
- `/reset-password` — **Reset Password Page**: Opened from the password recovery email link; verifies the recovery session, sets a new password (minimum 8 characters), signs out, and redirects to `/login`.

### Protected App Routes (inside the sidebar AppShell)
- `/dashboard` — **Dashboard** (Manager and Clerk views)
- `/products` — **Products** (Manager and Clerk; includes Manager-only **Add product** modal)
- `/sales` — **Sales** (Manager and Clerk; includes Manager-only historical CSV import)
- `/stock-in` — **Stock In** (Manager and Clerk; requires expiry date for perishable products)
- `/expiry` — **Expiry Tracking** (Manager and Clerk; batch write-offs and expiry monitoring)
- `/forecast` — **Demand & Profit Forecast** (Manager only)
- `/alerts` — **Alerts** (Manager sees all alert types; Clerk sees Low stock only)
- `/ai-assistant` — **AI Assistant** (Manager only)

*(Note: `vercel.json` rewrites all paths to `/index.html` so browser refresh works on every route in production.)*

---

## 3. Pages

### Landing Page (`/`)
- Responsive, mobile-first layout (tested across 360px, 768px, and 1280px viewports with a mobile hamburger menu).
- Hero section with headline, supporting copy, primary **Log in** (or **Go to dashboard**) CTA, secondary **See how it works** scroll button, and a static dashboard preview card clearly labelled `Sample data`.
- Six feature cards: **Stock tracking**, **Demand forecast (machine learning)**, **Profit prediction**, **Smart alerts**, **Expiry tracking**, and **AI assistant**.
- 4-step **How it works** section and a two-column **Manager vs Clerk** role comparison.

### Login, Forgot Password, and Reset Password (`/login`, `/forgot-password`, `/reset-password`)
- Standard email/password login via Supabase Auth.
- **Forgot password (`/forgot-password`)**: Calls `supabase.auth.resetPasswordForEmail` with `redirectTo: <origin>/reset-password`, shows *"If an account exists for this email, a reset link has been sent"*, and disables the button for 60 seconds.
- **Important note on Forgot Password:** To receive a real reset email during testing or production, the user account must have a real, deliverable email address (the seeded demo emails `manager@supermarket.rw` and `clerk@supermarket.rw` are fictional domains), and `<origin>/reset-password` must be added under **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**.

### Dashboard (`/dashboard`)
- **Manager view:**
  - 4-column responsive KPI grid: **Stock value at cost (RWF)** (based on sellable stock), **Low-stock items**, **Predicted profit (7d / 30d)**, and **Model accuracy (`100 − WAPE`)**.
  - **Expired / expiring within 7 days** card showing unit/batch counts and RWF value at cost.
  - **AI summary** card rendering the latest saved insight in formatted Markdown with a **Refresh insight** button.
  - **Top 5 products by predicted 30-day profit** and **5 most urgent alerts** with a link to `/alerts`.
- **Clerk view:**
  - Displays the clerk's own sales count recorded today, low-stock item count, expired / expiring within 7 days unit counts, and the low-stock table—with all cost, loss, profit, and forecast figures hidden.

### Products (`/products`)
- Filterable table of active products showing name, SKU, category chip, `Tracks expiry` chip for perishable goods, cost (Manager only), selling price, current on-hand stock, and a `Low stock` chip when `current_stock <= reorder_level`.
- **Add product (Manager only):**
  - Modal form with name, category (choose existing or create a new category inline), auto-suggested next free SKU (for example `DRK-009`, editable and validated for uniqueness), cost price, selling price (with a non-blocking warning if selling price is below cost), opening stock, reorder level, and a **Tracks expiry** toggle.
  - If **Tracks expiry** is enabled and opening stock is above 0, requires a future expiry date for the opening batch.
  - If opening stock is above 0, inserts the product with `current_stock = 0` and logs an opening `'delivery'` stock movement (and opening batch if tracked) so the database trigger increments `current_stock` once without double-counting.

### Sales (`/sales`)
- Search and select a product, enter quantity and date, view auto-filled unit price (and unit cost for Manager only) and line total in RWF.
- **Sellable stock & FEFO:** For expiry-tracked products, displays **Available stock (in date)** (`current_stock` minus units in expired active batches). Sales deduct from in-date batches in earliest-expiry-first (FEFO) order and block the sale if requested quantity exceeds in-date units.
- Recent sales list: Managers see the latest 50 sales; Clerks see only the sales they recorded today.
- **CSV Import (Manager only):** Upload `date, sku, quantity` CSV files, preview rows and unknown-SKU errors, and import via the `import_historical_sales` RPC. When `"Also adjust stock"` is unchecked (default), neither `current_stock` nor `stock_batches` are modified.

### Stock In (`/stock-in`)
- Record supplier deliveries (`type = 'delivery'`), which increase `products.current_stock` via the database trigger.
- When the selected product has `tracks_expiry = true`, a future **Expiry date** is required and the delivery creates an active batch in `stock_batches`.
- Lists the 50 most recent deliveries.

### Expiry Tracking (`/expiry`)
- Accessible to both Managers and Clerks.
- Summary cards for **Expired units**, **Expiring within 7 days**, and **Expiring within 30 days** (with RWF value at cost shown to Managers only).
- Filter chips: **Expired**, **Expiring within 7 days**, **Expiring within 30 days**, and **Written off**.
- **Write off** button per batch and **Write off all expired** button (both with confirmation dialogs). Writing off a batch sets its status to `written_off`, logs a `'write_off'` stock movement, reduces `products.current_stock` by the written-off units, and records `loss_amount = units × cost_price` server-side. Write-offs are not sales and do not affect the demand forecast.
- Clerks read batches through `stock_batches_view`, which masks `cost_price`, `value_at_cost`, and `loss_amount` as `NULL`.

### Forecast (`/forecast` — Manager only)
- **Run forecast** button invokes the `run-forecast` Edge Function (closed-form Ridge Regression trained on 180 days of daily sales with 28-day backtesting against a 7-day moving-average baseline).
- Products with fewer than 28 days of sales history are skipped by the model, shown as `Not enough history yet` in the table, and excluded from forecast totals, accuracy, and forecast-based alerts.
- Recharts line chart comparing the last 60 days of actual daily sales against the next 30 days of predicted daily sales for any selected product.
- Sortable table of all products showing 7-day units, 30-day units, 30-day predicted profit, current stock, and estimated days of stock left.

### Alerts (`/alerts`)
- Filter chips: **All**, **Low stock**, **Stock-out risk**, **Overstock**, **Slow movers** (sorted with **Stock-out risk** and earliest stock-out date first).
- Uses sellable stock for expiry-tracked products. Suggested reorder quantity for low-stock and stock-out items is `ceil(predicted_14d_demand + reorder_level - sellable_stock)`.
- Clerks see only **Low stock** alerts with no forecast or profit data.

### AI Assistant (`/ai-assistant` — Manager only)
- Interactive Q&A chat with 4 suggested question chips and Markdown-formatted replies.
- Uses the shared server-side summary helper (`supabase/functions/_shared/summary.ts`) so `ai-insights` and `ai-assistant` always receive identical verified figures (including top 5 urgent alerts, category 7d/30d totals, overstock/slow movers, and top 10 expired/expiring batches by cost).

---

## 4. Database Setup, Seed Scripts, and Edge Functions

1. **SQL Migrations (run in order in Supabase SQL Editor):**
   - `supabase/migrations/001_schema_and_triggers.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_stage2_sales_stock_forecast.sql`
   - `supabase/migrations/004_stage5_expiry_tracking.sql`

2. **Seed Scripts:**
   - Main demo seed (creates Manager & Clerk accounts, 7 categories, 50 Rwandan supermarket products, and 12 months of daily sales):
     ```bash
     npm run seed
     ```
   - Expiry batches seed (safe to re-run without resetting products or sales; marks Dairy, Bakery, Fresh Produce, and Fresh Juices as `tracks_expiry = true` and seeds 1–3 batches per product across expired, 7-day, 30-day, and long-term buckets):
     ```bash
     npm run seed:expiry
     ```

3. **Edge Functions Deployment:**
   ```bash
   npx supabase secrets set OPENROUTER_API_KEY=your_key OPENROUTER_MODEL=openai/gpt-4o-mini
   npx supabase functions deploy run-forecast
   npx supabase functions deploy ai-insights
   npx supabase functions deploy ai-assistant
   ```

---

## 5. Demo Script (Step-by-Step Walkthrough)

1. **Landing Page (`/`):**
   - Open `/` while logged out. Point out the responsive hero section, the static preview card labelled `Sample data`, the 6 core feature cards, the 4-step workflow, and the Manager vs Clerk role comparison.
   - Click **Log in** to open `/login`.

2. **Forgot Password (`/forgot-password`):**
   - On `/login`, click **Forgot password?**.
   - Enter an email and click **Send reset link**. Note that the confirmation message is always identical for security and the button enters a 60-second cooldown. *(To test receiving the actual email link to `/reset-password`, use an account registered with a real email address and ensure `<origin>/reset-password` is listed in Supabase Auth Redirect URLs.)*

3. **Manager Login & Forecast (`/login` → `/dashboard` → `/forecast`):**
   - Sign in as Manager (`manager@supermarket.rw` / `ManagerPassword123!`). You land on `/dashboard`.
   - Open **Forecast** (`/forecast`) and click **Run forecast**. Point out the 7-day and 30-day predicted revenue and profit in RWF, the 28-day backtest accuracy (`100 − WAPE`) compared against the 7-day moving average, and the 60-day actual vs 30-day predicted chart.

4. **Add a New Product (`/products`):**
   - Open **Products** (`/products`) and click **Add product**.
   - Select a category (or create a new one inline) and observe the auto-suggested SKU.
   - Enter cost and selling prices in RWF, set opening stock (for example `8`) below the reorder level (`15`), enable **Tracks expiry**, pick a future expiry date, and save.
   - Check `/forecast` to confirm the newly added product shows `Not enough history yet`, and check `/alerts` to confirm it appears under **Low stock** but is excluded from forecast-based alerts.

5. **Expiry Tracking, FEFO Sales, and Write-Offs (`/stock-in`, `/sales`, `/expiry`):**
   - Open **Expiry** (`/expiry`) and show the **Expired units**, **Expiring within 7 days**, and **Expiring within 30 days** cards with their RWF cost values.
   - Open **Stock In** (`/stock-in`), select a product that tracks expiry, and show that a future expiry date is required to record the delivery batch.
   - Open **Sales** (`/sales`), select a perishable product that has an expired batch, and show that **Available stock (in date)** excludes expired units. Try selling more than the in-date units to demonstrate the block message, then sell a valid quantity to demonstrate FEFO deduction.
   - Return to **Expiry** (`/expiry`), click **Write off** on an expired batch, confirm, and show that it moves to the **Written off** tab with its calculated RWF `loss_amount` and reduces `current_stock`.

6. **Dashboard & AI Assistant (`/dashboard`, `/ai-assistant`):**
   - Open **Dashboard** (`/dashboard`), review the 4 KPI cards, the **Expired / expiring within 7 days** card, the top 5 profit products, and the 5 most urgent alerts, and click **Refresh insight** on the **AI summary** card.
   - Open **AI Assistant** (`/ai-assistant`) and click the suggested question chips (such as *"What should I restock this week?"* or *"Which category will earn the most profit next month?"*) to show Markdown-formatted answers grounded strictly in the server summary.

7. **Clerk Role Verification:**
   - Sign out and log in as Clerk (`clerk@supermarket.rw` / `ClerkPassword123!`).
   - Show that **Forecast** and **AI Assistant** are hidden from the sidebar (and blocked by route protection and RLS), the **Add product** button and **Cost** columns are hidden on `/products`, `/sales`, `/dashboard`, and `/expiry`, and the clerk can still record sales, log deliveries, and write off expired batches.

