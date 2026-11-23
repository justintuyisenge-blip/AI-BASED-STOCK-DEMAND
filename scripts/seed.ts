import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Seed Script — Stage 1 Demo Data (Updated for ~25 days of average daily sales)
// Runs once using SUPABASE_SERVICE_ROLE_KEY (never exposed in frontend code).
// ============================================================================

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const MANAGER_ACCOUNT = {
  email: 'manager@supermarket.rw',
  password: 'ManagerPassword123!',
  full_name: 'Jean-Paul Habimana',
  role: 'manager' as const,
};

const CLERK_ACCOUNT = {
  email: 'clerk@supermarket.rw',
  password: 'ClerkPassword123!',
  full_name: 'Alice Uwase',
  role: 'clerk' as const,
};

type SeasonalityType = 'none' | 'dry_season' | 'rainy_season' | 'festive';

interface SeedProductDef {
  name: string;
  sku: string;
  category: string;
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  final_stock: number; // Most products ~25 days of avg daily sales; 8 deliberately <= reorder_level
  base_daily_units: number; // Fast-moving vs slow-moving baseline
  trend: number; // Mild 12-month trend (-0.15 to +0.25)
  seasonality: SeasonalityType;
}

// 50 realistic Rwandan supermarket products across 7 categories.
// All prices in RWF (whole integers), cost < price with margins between 10% and 35%.
// Most products start with ~25 days of their average daily sales in stock,
// with 8 products deliberately low (<= reorder_level) and a few at ~52 days for overstock testing.
const PRODUCTS_DATA: SeedProductDef[] = [
  // 1. Groceries & Staples (10 items)
  {
    name: 'Minimex Kawunga Maize Flour 5kg',
    sku: 'GRC-001',
    category: 'Groceries & Staples',
    cost_price: 4200,
    selling_price: 5000, // 16.0% margin
    reorder_level: 25,
    final_stock: 220, // ~25 days of avg daily sales
    base_daily_units: 7,
    trend: 0.12,
    seasonality: 'none',
  },
  {
    name: 'Kinazi Cassava Flour 2kg',
    sku: 'GRC-002',
    category: 'Groceries & Staples',
    cost_price: 2100,
    selling_price: 2600, // 19.2% margin
    reorder_level: 20,
    final_stock: 14, // Deliberately low stock #1
    base_daily_units: 8,
    trend: 0.08,
    seasonality: 'none',
  },
  {
    name: 'Tanzania Aromatic Rice (Umuceri) 5kg',
    sku: 'GRC-003',
    category: 'Groceries & Staples',
    cost_price: 6300,
    selling_price: 7500, // 16.0% margin
    reorder_level: 20,
    final_stock: 285, // ~25 days of avg daily sales
    base_daily_units: 9,
    trend: 0.15,
    seasonality: 'festive',
  },
  {
    name: 'Kabuye White Sugar 1kg',
    sku: 'GRC-004',
    category: 'Groceries & Staples',
    cost_price: 1350,
    selling_price: 1600, // 15.6% margin
    reorder_level: 35,
    final_stock: 560, // ~25 days of avg daily sales
    base_daily_units: 18,
    trend: 0.05,
    seasonality: 'none',
  },
  {
    name: 'Sosoma Fortified Porridge Flour 1kg',
    sku: 'GRC-005',
    category: 'Groceries & Staples',
    cost_price: 1600,
    selling_price: 2100, // 23.8% margin
    reorder_level: 25,
    final_stock: 320, // ~25 days of avg daily sales
    base_daily_units: 10,
    trend: 0.14,
    seasonality: 'rainy_season',
  },
  {
    name: 'Akabanga Chili Oil Dropper 100ml',
    sku: 'GRC-006',
    category: 'Groceries & Staples',
    cost_price: 1000,
    selling_price: 1400, // 28.6% margin
    reorder_level: 20,
    final_stock: 410, // ~52 days of avg daily sales (Overstock example)
    base_daily_units: 6,
    trend: 0.2,
    seasonality: 'none',
  },
  {
    name: 'Azam All-Purpose Wheat Flour 2kg',
    sku: 'GRC-007',
    category: 'Groceries & Staples',
    cost_price: 2200,
    selling_price: 2700, // 18.5% margin
    reorder_level: 25,
    final_stock: 280, // ~25 days of avg daily sales
    base_daily_units: 9,
    trend: 0.06,
    seasonality: 'festive',
  },
  {
    name: 'Sunny Refined Cooking Oil 3L',
    sku: 'GRC-008',
    category: 'Groceries & Staples',
    cost_price: 6800,
    selling_price: 8200, // 17.1% margin
    reorder_level: 18,
    final_stock: 12, // Deliberately low stock #2
    base_daily_units: 6,
    trend: 0.1,
    seasonality: 'festive',
  },
  {
    name: 'Red Kidney Beans (Ibishyimbo) 2kg',
    sku: 'GRC-009',
    category: 'Groceries & Staples',
    cost_price: 2000,
    selling_price: 2500, // 20.0% margin
    reorder_level: 30,
    final_stock: 365, // ~25 days of avg daily sales
    base_daily_units: 12,
    trend: -0.04,
    seasonality: 'none',
  },
  {
    name: 'Iodized Fine Table Salt 1kg',
    sku: 'GRC-010',
    category: 'Groceries & Staples',
    cost_price: 450,
    selling_price: 600, // 25.0% margin
    reorder_level: 30,
    final_stock: 340, // ~25 days of avg daily sales
    base_daily_units: 11,
    trend: 0.02,
    seasonality: 'none',
  },

  // 2. Drinks (8 items)
  {
    name: 'Inyange Mineral Water 1.5L',
    sku: 'DRK-001',
    category: 'Drinks',
    cost_price: 550,
    selling_price: 800, // 31.2% margin
    reorder_level: 60,
    final_stock: 860, // ~25 days of avg daily sales
    base_daily_units: 28,
    trend: 0.18,
    seasonality: 'dry_season',
  },
  {
    name: 'Inyange Mineral Water 500ml',
    sku: 'DRK-002',
    category: 'Drinks',
    cost_price: 300,
    selling_price: 450, // 33.3% margin
    reorder_level: 80,
    final_stock: 1040, // ~25 days of avg daily sales
    base_daily_units: 34,
    trend: 0.15,
    seasonality: 'dry_season',
  },
  {
    name: 'Inyange Pure Apple Juice 1L',
    sku: 'DRK-003',
    category: 'Drinks',
    cost_price: 1500,
    selling_price: 2000, // 25.0% margin
    reorder_level: 25,
    final_stock: 19, // Deliberately low stock #3
    base_daily_units: 9,
    trend: 0.12,
    seasonality: 'dry_season',
  },
  {
    name: 'Agashya Passion Fruit Squash 1L',
    sku: 'DRK-004',
    category: 'Drinks',
    cost_price: 2700,
    selling_price: 3500, // 22.9% margin
    reorder_level: 15,
    final_stock: 155, // ~25 days of avg daily sales
    base_daily_units: 5,
    trend: 0.16,
    seasonality: 'festive',
  },
  {
    name: 'Bralirwa Fanta Citron 500ml',
    sku: 'DRK-005',
    category: 'Drinks',
    cost_price: 600,
    selling_price: 800, // 25.0% margin
    reorder_level: 50,
    final_stock: 730, // ~25 days of avg daily sales
    base_daily_units: 24,
    trend: 0.1,
    seasonality: 'dry_season',
  },
  {
    name: 'Bralirwa Coca-Cola PET 500ml',
    sku: 'DRK-006',
    category: 'Drinks',
    cost_price: 600,
    selling_price: 800, // 25.0% margin
    reorder_level: 50,
    final_stock: 670, // ~25 days of avg daily sales
    base_daily_units: 22,
    trend: 0.08,
    seasonality: 'dry_season',
  },
  {
    name: "Gorilla's Coffee Medium Roast 500g",
    sku: 'DRK-007',
    category: 'Drinks',
    cost_price: 4200,
    selling_price: 5500, // 23.6% margin
    reorder_level: 15,
    final_stock: 130, // ~25 days of avg daily sales
    base_daily_units: 4,
    trend: 0.22,
    seasonality: 'rainy_season',
  },
  {
    name: 'Pfunda Rwanda Black Tea 250g',
    sku: 'DRK-008',
    category: 'Drinks',
    cost_price: 1100,
    selling_price: 1500, // 26.7% margin
    reorder_level: 25,
    final_stock: 315, // ~25 days of avg daily sales
    base_daily_units: 10,
    trend: 0.09,
    seasonality: 'rainy_season',
  },

  // 3. Dairy (7 items)
  {
    name: 'Inyange UHT Whole Milk 1L',
    sku: 'DRY-001',
    category: 'Dairy',
    cost_price: 1150,
    selling_price: 1400, // 17.9% margin
    reorder_level: 50,
    final_stock: 42, // Deliberately low stock #4
    base_daily_units: 26,
    trend: 0.14,
    seasonality: 'none',
  },
  {
    name: 'Inyange Low Fat Milk 500ml',
    sku: 'DRY-002',
    category: 'Dairy',
    cost_price: 600,
    selling_price: 750, // 20.0% margin
    reorder_level: 40,
    final_stock: 550, // ~25 days of avg daily sales
    base_daily_units: 18,
    trend: 0.11,
    seasonality: 'none',
  },
  {
    name: 'Ikivuguto Traditional Fermented Milk 1L',
    sku: 'DRY-003',
    category: 'Dairy',
    cost_price: 1050,
    selling_price: 1300, // 19.2% margin
    reorder_level: 30,
    final_stock: 460, // ~25 days of avg daily sales
    base_daily_units: 15,
    trend: 0.13,
    seasonality: 'dry_season',
  },
  {
    name: 'Inyange Strawberry Yoghurt 400g',
    sku: 'DRY-004',
    category: 'Dairy',
    cost_price: 900,
    selling_price: 1200, // 25.0% margin
    reorder_level: 25,
    final_stock: 375, // ~25 days of avg daily sales
    base_daily_units: 12,
    trend: 0.17,
    seasonality: 'none',
  },
  {
    name: 'Masaka Farms Vanilla Yoghurt 450g',
    sku: 'DRY-005',
    category: 'Dairy',
    cost_price: 1000,
    selling_price: 1350, // 25.9% margin
    reorder_level: 20,
    final_stock: 280, // ~25 days of avg daily sales
    base_daily_units: 9,
    trend: 0.19,
    seasonality: 'none',
  },
  {
    name: 'Blue Band Original Margarine 500g',
    sku: 'DRY-006',
    category: 'Dairy',
    cost_price: 1950,
    selling_price: 2400, // 18.8% margin
    reorder_level: 25,
    final_stock: 245, // ~25 days of avg daily sales
    base_daily_units: 8,
    trend: 0.04,
    seasonality: 'none',
  },
  {
    name: 'Gishwati Gouda Cheese Block 250g',
    sku: 'DRY-007',
    category: 'Dairy',
    cost_price: 2600,
    selling_price: 3400, // 23.5% margin
    reorder_level: 12,
    final_stock: 210, // ~54 days of avg daily sales (Overstock example)
    base_daily_units: 3,
    trend: 0.15,
    seasonality: 'festive',
  },

  // 4. Bakery (6 items)
  {
    name: 'Family Sliced White Bread 800g',
    sku: 'BKR-001',
    category: 'Bakery',
    cost_price: 1150,
    selling_price: 1500, // 23.3% margin
    reorder_level: 40,
    final_stock: 910, // ~25 days of avg daily sales
    base_daily_units: 30,
    trend: 0.1,
    seasonality: 'none',
  },
  {
    name: 'Whole Wheat Brown Bread 800g',
    sku: 'BKR-002',
    category: 'Bakery',
    cost_price: 1300,
    selling_price: 1700, // 23.5% margin
    reorder_level: 25,
    final_stock: 18, // Deliberately low stock #5
    base_daily_units: 14,
    trend: 0.2,
    seasonality: 'none',
  },
  {
    name: 'Soft Milk Bread Rolls (Pack of 6)',
    sku: 'BKR-003',
    category: 'Bakery',
    cost_price: 900,
    selling_price: 1200, // 25.0% margin
    reorder_level: 25,
    final_stock: 485, // ~25 days of avg daily sales
    base_daily_units: 16,
    trend: 0.07,
    seasonality: 'none',
  },
  {
    name: 'Fresh Mandazi Doughnuts (Pack of 6)',
    sku: 'BKR-004',
    category: 'Bakery',
    cost_price: 700,
    selling_price: 1000, // 30.0% margin
    reorder_level: 30,
    final_stock: 605, // ~25 days of avg daily sales
    base_daily_units: 20,
    trend: 0.05,
    seasonality: 'none',
  },
  {
    name: 'Butter Croissants (Pack of 4)',
    sku: 'BKR-005',
    category: 'Bakery',
    cost_price: 1900,
    selling_price: 2600, // 26.9% margin
    reorder_level: 15,
    final_stock: 190, // ~25 days of avg daily sales
    base_daily_units: 6,
    trend: 0.18,
    seasonality: 'festive',
  },
  {
    name: 'Spiced Banana Tea Loaf 500g',
    sku: 'BKR-006',
    category: 'Bakery',
    cost_price: 1500,
    selling_price: 2100, // 28.6% margin
    reorder_level: 15,
    final_stock: 215, // ~25 days of avg daily sales
    base_daily_units: 7,
    trend: 0.12,
    seasonality: 'festive',
  },

  // 5. Fresh Produce (7 items)
  {
    name: 'Musanze Irish Potatoes (Ibirayi) 5kg',
    sku: 'PRD-001',
    category: 'Fresh Produce',
    cost_price: 2100,
    selling_price: 2700, // 22.2% margin
    reorder_level: 30,
    final_stock: 490, // ~25 days of avg daily sales
    base_daily_units: 16,
    trend: 0.09,
    seasonality: 'none',
  },
  {
    name: 'Green Cooking Bananas (Ibitoki) 3kg',
    sku: 'PRD-002',
    category: 'Fresh Produce',
    cost_price: 1300,
    selling_price: 1700, // 23.5% margin
    reorder_level: 25,
    final_stock: 425, // ~25 days of avg daily sales
    base_daily_units: 14,
    trend: 0.05,
    seasonality: 'none',
  },
  {
    name: 'Sweet Yellow Bananas (Imineke) 1kg',
    sku: 'PRD-003',
    category: 'Fresh Produce',
    cost_price: 650,
    selling_price: 950, // 31.6% margin
    reorder_level: 35,
    final_stock: 24, // Deliberately low stock #6
    base_daily_units: 21,
    trend: 0.11,
    seasonality: 'none',
  },
  {
    name: 'Rwamagana Hass Avocados (Pack of 4)',
    sku: 'PRD-004',
    category: 'Fresh Produce',
    cost_price: 700,
    selling_price: 1000, // 30.0% margin
    reorder_level: 25,
    final_stock: 465, // ~25 days of avg daily sales
    base_daily_units: 15,
    trend: 0.14,
    seasonality: 'none',
  },
  {
    name: 'Vine Ripened Red Tomatoes 1kg',
    sku: 'PRD-005',
    category: 'Fresh Produce',
    cost_price: 850,
    selling_price: 1200, // 29.2% margin
    reorder_level: 30,
    final_stock: 580, // ~25 days of avg daily sales
    base_daily_units: 19,
    trend: 0.08,
    seasonality: 'none',
  },
  {
    name: 'Red Bulb Onions 1kg',
    sku: 'PRD-006',
    category: 'Fresh Produce',
    cost_price: 950,
    selling_price: 1300, // 26.9% margin
    reorder_level: 25,
    final_stock: 455, // ~25 days of avg daily sales
    base_daily_units: 15,
    trend: 0.06,
    seasonality: 'none',
  },
  {
    name: 'Fresh Tree Tomatoes (Ibintomvu) 1kg',
    sku: 'PRD-007',
    category: 'Fresh Produce',
    cost_price: 1100,
    selling_price: 1500, // 26.7% margin
    reorder_level: 20,
    final_stock: 310, // ~25 days of avg daily sales
    base_daily_units: 10,
    trend: 0.13,
    seasonality: 'dry_season',
  },

  // 6. Household (6 items)
  {
    name: 'Sulfo Multi-Purpose Laundry Soap Bar 800g',
    sku: 'HSH-001',
    category: 'Household',
    cost_price: 1050,
    selling_price: 1350, // 22.2% margin
    reorder_level: 35,
    final_stock: 435, // ~25 days of avg daily sales
    base_daily_units: 14,
    trend: 0.05,
    seasonality: 'none',
  },
  {
    name: 'Omo Hand Washing Detergent Powder 1kg',
    sku: 'HSH-002',
    category: 'Household',
    cost_price: 2400,
    selling_price: 3000, // 20.0% margin
    reorder_level: 25,
    final_stock: 20, // Deliberately low stock #7
    base_daily_units: 8,
    trend: 0.1,
    seasonality: 'none',
  },
  {
    name: 'Sunlight Lemon Dishwashing Liquid 750ml',
    sku: 'HSH-003',
    category: 'Household',
    cost_price: 1750,
    selling_price: 2200, // 20.5% margin
    reorder_level: 20,
    final_stock: 220, // ~25 days of avg daily sales
    base_daily_units: 7,
    trend: 0.12,
    seasonality: 'none',
  },
  {
    name: 'Supa Soft Toilet Tissue (Pack of 4)',
    sku: 'HSH-004',
    category: 'Household',
    cost_price: 1400,
    selling_price: 1850, // 24.3% margin
    reorder_level: 35,
    final_stock: 470, // ~25 days of avg daily sales
    base_daily_units: 15,
    trend: 0.09,
    seasonality: 'none',
  },
  {
    name: 'Jik Regular Household Bleach 750ml',
    sku: 'HSH-005',
    category: 'Household',
    cost_price: 1550,
    selling_price: 2000, // 22.5% margin
    reorder_level: 20,
    final_stock: 330, // ~52 days of avg daily sales (Overstock example)
    base_daily_units: 5,
    trend: 0.04,
    seasonality: 'none',
  },
  {
    name: 'Eco-Briquettes Smokeless Charcoal 5kg',
    sku: 'HSH-006',
    category: 'Household',
    cost_price: 2000,
    selling_price: 2600, // 23.1% margin
    reorder_level: 20,
    final_stock: 195, // ~25 days of avg daily sales
    base_daily_units: 6,
    trend: 0.24,
    seasonality: 'rainy_season',
  },

  // 7. Personal Care (6 items)
  {
    name: 'Movit Baby Petroleum Jelly 250g',
    sku: 'PRC-001',
    category: 'Personal Care',
    cost_price: 1100,
    selling_price: 1500, // 26.7% margin
    reorder_level: 25,
    final_stock: 215, // ~25 days of avg daily sales
    base_daily_units: 7,
    trend: 0.07,
    seasonality: 'none',
  },
  {
    name: 'Colgate Triple Action Toothpaste 100ml',
    sku: 'PRC-002',
    category: 'Personal Care',
    cost_price: 1350,
    selling_price: 1800, // 25.0% margin
    reorder_level: 25,
    final_stock: 16, // Deliberately low stock #8
    base_daily_units: 9,
    trend: 0.11,
    seasonality: 'none',
  },
  {
    name: 'Geisha Long-Lasting Bath Soap 125g',
    sku: 'PRC-003',
    category: 'Personal Care',
    cost_price: 650,
    selling_price: 900, // 27.8% margin
    reorder_level: 40,
    final_stock: 430, // ~25 days of avg daily sales
    base_daily_units: 14,
    trend: 0.08,
    seasonality: 'none',
  },
  {
    name: 'Dettol Original Antibacterial Soap 100g',
    sku: 'PRC-004',
    category: 'Personal Care',
    cost_price: 950,
    selling_price: 1300, // 26.9% margin
    reorder_level: 30,
    final_stock: 310, // ~25 days of avg daily sales
    base_daily_units: 10,
    trend: 0.1,
    seasonality: 'none',
  },
  {
    name: 'Nivea Nourishing Body Lotion 400ml',
    sku: 'PRC-005',
    category: 'Personal Care',
    cost_price: 3400,
    selling_price: 4500, // 24.4% margin
    reorder_level: 15,
    final_stock: 205, // ~53 days of avg daily sales (Overstock example)
    base_daily_units: 3,
    trend: 0.15,
    seasonality: 'dry_season',
  },
  {
    name: 'Softcare Cotton Sanitary Pads (Pack of 10)',
    sku: 'PRC-006',
    category: 'Personal Care',
    cost_price: 900,
    selling_price: 1250, // 28.0% margin
    reorder_level: 30,
    final_stock: 345, // ~25 days of avg daily sales
    base_daily_units: 11,
    trend: 0.13,
    seasonality: 'none',
  },
];

// Simple deterministic pseudo-random generator so noise is realistic and reproducible
function createRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function ensureUser(account: {
  email: string;
  password: string;
  full_name: string;
  role: 'manager' | 'clerk';
}): Promise<string> {
  // Check if user already exists
  const { data: listData, error: listError } =
    await supabase.auth.admin.listUsers();

  if (listError) {
    throw new Error(`Failed to list auth users: ${listError.message}`);
  }

  const existing = listData.users.find(
    (u) => u.email?.toLowerCase() === account.email.toLowerCase()
  );

  let userId: string;

  if (existing) {
    userId = existing.id;
    const { error: updateErr } = await supabase.auth.admin.updateUserById(
      userId,
      {
        password: account.password,
        email_confirm: true,
      }
    );
    if (updateErr) {
      throw new Error(`Failed to update user ${account.email}: ${updateErr.message}`);
    }
  } else {
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
      });

    if (createErr || !created.user) {
      throw new Error(
        `Failed to create user ${account.email}: ${createErr?.message}`
      );
    }
    userId = created.user.id;
  }

  // Upsert profile row
  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      full_name: account.full_name,
      role: account.role,
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    throw new Error(
      `Failed to upsert profile for ${account.email}: ${profileError.message}`
    );
  }

  return userId;
}

function formatDateYYYYMMDD(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function runSeed() {
  console.log('Starting seed script...');

  // 1. Create Manager and Clerk users
  console.log('1. Creating manager and clerk users...');
  const managerId = await ensureUser(MANAGER_ACCOUNT);
  const clerkId = await ensureUser(CLERK_ACCOUNT);

  // 2. Clear existing sales, stock_movements, products, categories so re-running is clean
  console.log('2. Cleaning existing demo records...');
  await supabase.from('sales').delete().neq('quantity', -999999);
  await supabase.from('stock_movements').delete().neq('quantity', -999999);
  await supabase.from('forecast_daily').delete().neq('predicted_units', -999999);
  await supabase.from('forecasts').delete().neq('horizon_days', -999999);
  await supabase.from('ai_insights').delete().neq('content', '__none__');
  await supabase.from('products').delete().neq('sku', '__none__');
  await supabase.from('categories').delete().neq('name', '__none__');

  // 3. Insert categories
  console.log('3. Inserting categories...');
  const uniqueCategoryNames = Array.from(
    new Set(PRODUCTS_DATA.map((p) => p.category))
  );

  const { data: insertedCategories, error: catError } = await supabase
    .from('categories')
    .insert(uniqueCategoryNames.map((name) => ({ name })))
    .select('id, name');

  if (catError || !insertedCategories) {
    throw new Error(`Failed to insert categories: ${catError?.message}`);
  }

  const categoryIdByName = new Map<string, string>();
  for (const cat of insertedCategories) {
    categoryIdByName.set(cat.name, cat.id);
  }

  // 4. Insert the 50 products
  console.log(`4. Inserting ${PRODUCTS_DATA.length} Rwandan supermarket products...`);
  const productRowsToInsert = PRODUCTS_DATA.map((p) => ({
    name: p.name,
    sku: p.sku,
    category_id: categoryIdByName.get(p.category)!,
    cost_price: p.cost_price,
    selling_price: p.selling_price,
    current_stock: p.final_stock,
    reorder_level: p.reorder_level,
    is_active: true,
  }));

  const { data: insertedProducts, error: prodError } = await supabase
    .from('products')
    .insert(productRowsToInsert)
    .select('id, sku');

  if (prodError || !insertedProducts) {
    throw new Error(`Failed to insert products: ${prodError?.message}`);
  }

  const productIdBySku = new Map<string, string>();
  for (const prod of insertedProducts) {
    productIdBySku.set(prod.sku, prod.id);
  }

  // 5. Generate 12 months (365 days) of daily sales per product, ending yesterday
  console.log('5. Generating 12 months of daily sales ending yesterday...');
  const rng = createRng(20261118);

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );

  const TOTAL_DAYS = 365;
  const salesToInsert: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    unit_cost: number;
    sold_on: string;
    created_by: string;
  }> = [];

  const totalSoldBySku = new Map<string, number>();

  for (let dayOffset = TOTAL_DAYS; dayOffset >= 1; dayOffset--) {
    const saleDate = new Date(todayUtc.getTime() - dayOffset * 86400000);
    const soldOn = formatDateYYYYMMDD(saleDate);
    const dayOfWeek = saleDate.getUTCDay(); // 0 = Sun, 6 = Sat
    const dayOfMonth = saleDate.getUTCDate(); // 1..31
    const month = saleDate.getUTCMonth() + 1; // 1..12
    const progress = (TOTAL_DAYS - dayOffset) / TOTAL_DAYS; // 0.0 -> 1.0

    // Weekend multiplier (higher on weekends)
    let weekendMultiplier = 1.0;
    if (dayOfWeek === 6) {
      weekendMultiplier = 1.35; // Saturday peak
    } else if (dayOfWeek === 0) {
      weekendMultiplier = 1.25; // Sunday
    } else if (dayOfWeek === 5) {
      weekendMultiplier = 1.12; // Friday evening shopping
    }

    // Payday / month-end bump (25th-31st and 1st-3rd of each month)
    const isPaydayWindow = dayOfMonth >= 25 || dayOfMonth <= 3;

    for (const productDef of PRODUCTS_DATA) {
      const productId = productIdBySku.get(productDef.sku)!;

      // Payday bump is stronger on staple groceries and household supplies
      let paydayMultiplier = 1.0;
      if (isPaydayWindow) {
        paydayMultiplier =
          productDef.category === 'Groceries & Staples' ||
          productDef.category === 'Household'
            ? 1.4
            : 1.22;
      }

      // Mild trend over the 12 months
      const trendMultiplier = 1 + productDef.trend * (progress - 0.5);

      // Seasonality multiplier
      let seasonalMultiplier = 1.0;
      if (productDef.seasonality === 'dry_season') {
        // Rwanda dry seasons: June-August and Jan-Feb
        if ([1, 2, 6, 7, 8].includes(month)) {
          seasonalMultiplier = 1.28;
        } else if ([4, 11].includes(month)) {
          seasonalMultiplier = 0.85;
        }
      } else if (productDef.seasonality === 'rainy_season') {
        // Rwanda rainy seasons: March-May and Oct-Nov
        if ([3, 4, 5, 10, 11].includes(month)) {
          seasonalMultiplier = 1.25;
        }
      } else if (productDef.seasonality === 'festive') {
        // Festive season boost in December
        if (month === 12) {
          seasonalMultiplier = 1.45;
        }
      }

      // Random daily noise (0.75 to 1.25)
      const noise = 0.75 + rng() * 0.5;

      const expectedUnits =
        productDef.base_daily_units *
        weekendMultiplier *
        paydayMultiplier *
        trendMultiplier *
        seasonalMultiplier *
        noise;

      const quantity = Math.max(1, Math.round(expectedUnits));

      salesToInsert.push({
        product_id: productId,
        quantity,
        unit_price: productDef.selling_price,
        unit_cost: productDef.cost_price,
        sold_on: soldOn,
        created_by: rng() > 0.25 ? clerkId : managerId,
      });

      totalSoldBySku.set(
        productDef.sku,
        (totalSoldBySku.get(productDef.sku) || 0) + quantity
      );
    }
  }

  // Before inserting 12 months of sales (which trigger stock reductions),
  // log initial stock deliveries so that after all sales triggers run,
  // every product lands on its exact target final_stock!
  console.log('6. Recording supplier deliveries to balance stock levels...');
  const deliveryMovements = PRODUCTS_DATA.map((p) => {
    const productId = productIdBySku.get(p.sku)!;
    const totalSold = totalSoldBySku.get(p.sku) || 0;
    return {
      product_id: productId,
      quantity: totalSold, // Exact replenishment so initial final_stock + deliveries - sales = final_stock
      type: 'delivery' as const,
      created_by: managerId,
    };
  });

  const { error: delivError } = await supabase
    .from('stock_movements')
    .insert(deliveryMovements);

  if (delivError) {
    throw new Error(`Failed to insert delivery movements: ${delivError.message}`);
  }

  // Insert sales in batches of 1,000 rows
  console.log(`7. Inserting ${salesToInsert.length.toLocaleString()} daily sale records in batches...`);
  const BATCH_SIZE = 1000;
  for (let i = 0; i < salesToInsert.length; i += BATCH_SIZE) {
    const batch = salesToInsert.slice(i, i + BATCH_SIZE);
    const { error: batchError } = await supabase.from('sales').insert(batch);
    if (batchError) {
      throw new Error(
        `Failed to insert sales batch at offset ${i}: ${batchError.message}`
      );
    }
    process.stdout.write(
      `   Inserted ${Math.min(i + BATCH_SIZE, salesToInsert.length).toLocaleString()} / ${salesToInsert.length.toLocaleString()} sales...\r`
    );
  }
  console.log('\n   All 12 months of daily sales inserted successfully.');

  // Print summary and login credentials
  const lowStockItems = PRODUCTS_DATA.filter(
    (p) => p.final_stock <= p.reorder_level
  );

  console.log('\n============================================================');
  console.log('SEED COMPLETE — SUPERMARKET STOCK & PROFIT SYSTEM (RWANDA)');
  console.log('============================================================');
  console.log(`Categories seeded : ${uniqueCategoryNames.length}`);
  console.log(`Products seeded   : ${PRODUCTS_DATA.length} (${lowStockItems.length} deliberately low-stock)`);
  console.log(`Daily sales rows  : ${salesToInsert.length.toLocaleString()} (365 days ending yesterday)`);
  console.log('------------------------------------------------------------');
  console.log('LOGIN CREDENTIALS:');
  console.log(`  Manager -> Email: ${MANAGER_ACCOUNT.email}`);
  console.log(`             Pass : ${MANAGER_ACCOUNT.password}`);
  console.log(`  Clerk   -> Email: ${CLERK_ACCOUNT.email}`);
  console.log(`             Pass : ${CLERK_ACCOUNT.password}`);
  console.log('============================================================\n');
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
