export type UserRole = 'manager' | 'clerk';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category_id: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  reorder_level: number;
  is_active: boolean;
  categories?: {
    name: string;
  } | null;
}

export interface Sale {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  sold_on: string;
  created_by: string | null;
  products?: {
    name: string;
    sku: string;
  } | null;
}

export interface StockMovement {
  id: string;
  product_id: string;
  quantity: number;
  type: 'delivery' | 'sale' | 'adjustment';
  note?: string | null;
  created_at: string;
  created_by: string | null;
  products?: {
    name: string;
    sku: string;
  } | null;
}

export interface Forecast {
  id: string;
  run_id: string | null;
  product_id: string;
  forecast_date: string;
  horizon_days: number;
  predicted_units: number;
  predicted_revenue: number;
  predicted_profit: number;
  model_name: string;
  wape: number | null;
  baseline_wape: number | null;
  generated_at: string;
}

export interface ForecastDaily {
  id: string;
  run_id: string;
  product_id: string;
  forecast_date: string;
  predicted_units: number;
}

export interface AiInsight {
  id: string;
  content: string;
  generated_at: string;
}
