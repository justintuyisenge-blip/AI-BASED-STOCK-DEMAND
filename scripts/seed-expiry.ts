import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Stage 5 Expiry Demo Seed Script (scripts/seed-expiry.ts)
// Safe to re-run:
// - Marks dairy, bakery, fresh produce, and fresh juice products as tracks_expiry = true.
// - Skips any product that already has rows in stock_batches.
// - Creates 1-3 batches per product that add up to its current_stock:
//   ~4 batches already expired (1-10 days ago),
//   ~6 batches expiring within 7 days,
//   ~8 batches expiring within 30 days,
//   and the remaining batches expiring 31-120 days away.
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

const PERISHABLE_CATEGORIES = new Set(['Dairy', 'Bakery', 'Fresh Produce']);
const FRESH_JUICE_SKUS = new Set(['DRK-003', 'DRK-004']);

function addDaysToToday(offsetDays: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays)
  );
  return d.toISOString().slice(0, 10);
}

async function runSeedExpiry() {
  console.log('Starting Stage 5 expiry tracking seed script...');

  // 1. Fetch all active products with their category names
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select(
      'id, name, sku, current_stock, tracks_expiry, categories(name)'
    )
    .eq('is_active', true)
    .order('sku', { ascending: true });

  if (prodErr || !products) {
    throw new Error(`Failed to fetch products: ${prodErr?.message}`);
  }

  // Filter dairy, bakery, fresh produce, and fresh juice products
  const perishableProducts = products.filter((p) => {
    const catObj = p.categories as unknown as { name: string } | null;
    const catName = catObj?.name || '';
    return (
      PERISHABLE_CATEGORIES.has(catName) ||
      FRESH_JUICE_SKUS.has(p.sku) ||
      p.name.toLowerCase().includes('juice')
    );
  });

  console.log(
    `Found ${perishableProducts.length} perishable products (Dairy, Bakery, Fresh Produce, and Fresh Juices).`
  );

  // 2. Mark all of them as tracks_expiry = true
  const perishableIds = perishableProducts.map((p) => p.id);
  if (perishableIds.length > 0) {
    const { error: updateErr } = await supabase
      .from('products')
      .update({ tracks_expiry: true })
      .in('id', perishableIds);

    if (updateErr) {
      throw new Error(
        `Failed to update tracks_expiry on products: ${updateErr.message}`
      );
    }
  }

  // 3. Check existing stock_batches so we skip any product that already has batches
  const { data: existingBatches, error: batchCheckErr } = await supabase
    .from('stock_batches')
    .select('product_id');

  if (batchCheckErr) {
    throw new Error(
      `Failed to check existing stock_batches: ${batchCheckErr.message}`
    );
  }

  const productsWithBatches = new Set(
    (existingBatches || []).map((b) => b.product_id)
  );

  // Pre-planned expiry offsets (in days from today):
  // - 4 expired batches: [-8, -5, -3, -1]
  // - 6 expiring within 7 days: [1, 2, 3, 5, 6, 7]
  // - 8 expiring within 30 days: [10, 12, 14, 17, 20, 23, 26, 29]
  // - Remaining batches: [35, 42, 48, 55, 60, 68, 75, 82, 90, 105, 115, ...]
  const expiredOffsets = [-8, -5, -3, -1];
  const within7Offsets = [1, 2, 3, 5, 6, 7];
  const within30Offsets = [10, 12, 14, 17, 20, 23, 26, 29];
  const longTermOffsets = [
    35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120,
  ];

  let expiredIdx = 0;
  let within7Idx = 0;
  let within30Idx = 0;
  let longTermIdx = 0;

  function pullNextOffset(bucket: 'expired' | 'within7' | 'within30' | 'long'): {
    expiryOffset: number;
    receivedOffset: number;
  } {
    if (bucket === 'expired' && expiredIdx < expiredOffsets.length) {
      const off = expiredOffsets[expiredIdx++];
      return { expiryOffset: off, receivedOffset: off - 14 };
    }
    if (bucket === 'within7' && within7Idx < within7Offsets.length) {
      const off = within7Offsets[within7Idx++];
      return { expiryOffset: off, receivedOffset: -12 };
    }
    if (bucket === 'within30' && within30Idx < within30Offsets.length) {
      const off = within30Offsets[within30Idx++];
      return { expiryOffset: off, receivedOffset: -10 };
    }
    const off = longTermOffsets[longTermIdx % longTermOffsets.length];
    longTermIdx++;
    return { expiryOffset: off, receivedOffset: -7 };
  }

  const batchesToInsert: Array<{
    product_id: string;
    received_on: string;
    expiry_date: string;
    quantity_received: number;
    quantity_remaining: number;
    status: 'active';
    loss_amount: number;
  }> = [];

  let seededProductsCount = 0;
  let skippedProductsCount = 0;

  for (let i = 0; i < perishableProducts.length; i++) {
    const product = perishableProducts[i];

    if (productsWithBatches.has(product.id)) {
      skippedProductsCount += 1;
      continue;
    }

    const totalStock = Math.max(0, product.current_stock);
    if (totalStock === 0) {
      skippedProductsCount += 1;
      continue;
    }

    seededProductsCount += 1;

    // Split product's current_stock into 2 or 3 batches that sum to exact current_stock
    if (totalStock < 15) {
      // Single batch for very small stock
      const bucket =
        within7Idx < within7Offsets.length
          ? 'within7'
          : within30Idx < within30Offsets.length
          ? 'within30'
          : 'long';
      const { expiryOffset, receivedOffset } = pullNextOffset(bucket);
      batchesToInsert.push({
        product_id: product.id,
        received_on: addDaysToToday(receivedOffset),
        expiry_date: addDaysToToday(expiryOffset),
        quantity_received: totalStock,
        quantity_remaining: totalStock,
        status: 'active',
        loss_amount: 0,
      });
    } else if (i < 4 && expiredIdx < expiredOffsets.length) {
      // First 4 products with sufficient stock get 1 small expired batch + 1 near-term batch + 1 long-term batch
      const qtyExpired = Math.max(2, Math.round(totalStock * 0.12));
      const qtyMid = Math.max(3, Math.round(totalStock * 0.33));
      const qtyLong = totalStock - qtyExpired - qtyMid;

      const b1 = pullNextOffset('expired');
      const b2 =
        within7Idx < within7Offsets.length
          ? pullNextOffset('within7')
          : pullNextOffset('within30');
      const b3 = pullNextOffset('long');

      batchesToInsert.push(
        {
          product_id: product.id,
          received_on: addDaysToToday(b1.receivedOffset),
          expiry_date: addDaysToToday(b1.expiryOffset),
          quantity_received: qtyExpired,
          quantity_remaining: qtyExpired,
          status: 'active',
          loss_amount: 0,
        },
        {
          product_id: product.id,
          received_on: addDaysToToday(b2.receivedOffset),
          expiry_date: addDaysToToday(b2.expiryOffset),
          quantity_received: qtyMid,
          quantity_remaining: qtyMid,
          status: 'active',
          loss_amount: 0,
        },
        {
          product_id: product.id,
          received_on: addDaysToToday(b3.receivedOffset),
          expiry_date: addDaysToToday(b3.expiryOffset),
          quantity_received: qtyLong,
          quantity_remaining: qtyLong,
          status: 'active',
          loss_amount: 0,
        }
      );
    } else {
      // 2 batches summing to totalStock
      const qtyFirst = Math.max(3, Math.round(totalStock * 0.35));
      const qtySecond = totalStock - qtyFirst;

      const firstBucket =
        within7Idx < within7Offsets.length
          ? 'within7'
          : within30Idx < within30Offsets.length
          ? 'within30'
          : 'long';

      const b1 = pullNextOffset(firstBucket);
      const b2 = pullNextOffset('long');

      batchesToInsert.push(
        {
          product_id: product.id,
          received_on: addDaysToToday(b1.receivedOffset),
          expiry_date: addDaysToToday(b1.expiryOffset),
          quantity_received: qtyFirst,
          quantity_remaining: qtyFirst,
          status: 'active',
          loss_amount: 0,
        },
        {
          product_id: product.id,
          received_on: addDaysToToday(b2.receivedOffset),
          expiry_date: addDaysToToday(b2.expiryOffset),
          quantity_received: qtySecond,
          quantity_remaining: qtySecond,
          status: 'active',
          loss_amount: 0,
        }
      );
    }
  }

  if (batchesToInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('stock_batches')
      .insert(batchesToInsert);

    if (insertErr) {
      throw new Error(`Failed to insert stock_batches: ${insertErr.message}`);
    }
  }

  console.log('\n============================================================');
  console.log('STAGE 5 EXPIRY SEED COMPLETE');
  console.log('============================================================');
  console.log(`Perishable products marked tracks_expiry = true : ${perishableProducts.length}`);
  console.log(`Products seeded with new batches                : ${seededProductsCount}`);
  console.log(`Products skipped (already had batches)          : ${skippedProductsCount}`);
  console.log(`Total new batches created                       : ${batchesToInsert.length}`);
  console.log(`  - Already expired (1-10 days ago)             : ${expiredIdx}`);
  console.log(`  - Expiring within 7 days                      : ${within7Idx}`);
  console.log(`  - Expiring within 30 days (8-30d)             : ${within30Idx}`);
  console.log(
    `  - Expiring 31-120 days away                   : ${Math.max(
      0,
      batchesToInsert.length - expiredIdx - within7Idx - within30Idx
    )}`
  );
  console.log('============================================================\n');
}

runSeedExpiry().catch((err) => {
  console.error('Expiry seed failed:', err);
  process.exit(1);
});

