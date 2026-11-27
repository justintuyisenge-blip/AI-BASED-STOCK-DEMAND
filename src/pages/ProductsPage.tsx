import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRWF } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Category, Product } from '../types/database';
import { getTodayLocalStr } from '../lib/alerts';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const CATEGORY_PREFIX_MAP: Record<string, string> = {
  'Groceries & Staples': 'GRC',
  Drinks: 'DRK',
  Dairy: 'DRY',
  Bakery: 'BKR',
  'Fresh Produce': 'PRD',
  Household: 'HSH',
  'Personal Care': 'PRC',
};

/**
 * Derive a 3-letter uppercase SKU prefix from a category name.
 */
function getCategoryPrefix(categoryName: string, products: Product[]): string {
  const trimmed = categoryName.trim();
  if (!trimmed) return 'PRD';

  if (CATEGORY_PREFIX_MAP[trimmed]) {
    return CATEGORY_PREFIX_MAP[trimmed];
  }

  // Check if any existing product in this category already has a PREFIX-NNN SKU
  const existingInCat = products.find(
    (p) =>
      p.categories?.name?.toLowerCase() === trimmed.toLowerCase() &&
      /^[A-Z]{3}-\d+/i.test(p.sku)
  );
  if (existingInCat) {
    return existingInCat.sku.split('-')[0].toUpperCase();
  }

  // Fallback: take up to 3 letters from the category name
  const letters = trimmed.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'PRD').padEnd(3, 'X');
}

/**
 * Suggest the next free SKU code for the chosen category (e.g. DRK-009 or DRK-051).
 */
function suggestNextSku(categoryName: string, products: Product[]): string {
  const prefix = getCategoryPrefix(categoryName, products);
  const existingSkus = new Set(products.map((p) => p.sku.toUpperCase()));

  let maxNum = 0;
  const prefixRegex = new RegExp(`^${prefix}-(\\d+)$`, 'i');

  for (const p of products) {
    const match = p.sku.trim().match(prefixRegex);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }

  let candidateNum = maxNum + 1;
  while (
    existingSkus.has(`${prefix}-${String(candidateNum).padStart(3, '0')}`)
  ) {
    candidateNum += 1;
  }

  return `${prefix}-${String(candidateNum).padStart(3, '0')}`;
}

export const ProductsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const isManager = profile?.role === 'manager';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  // Add Product Modal State (Manager only)
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [categoryMode, setCategoryMode] = useState<'existing' | 'new'>(
    'existing'
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [skuManuallyEdited, setSkuManuallyEdited] = useState<boolean>(false);
  const [costPrice, setCostPrice] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [openingStock, setOpeningStock] = useState<string>('0');
  const [reorderLevel, setReorderLevel] = useState<string>('15');
  const [tracksExpiry, setTracksExpiry] = useState<boolean>(false);
  const [openingExpiryDate, setOpeningExpiryDate] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const todayStr = useMemo(() => getTodayLocalStr(), []);

  const loadProductsAndCategories = async () => {
    setLoading(true);
    setError(null);

    const [prodRes, catRes] = await Promise.all([
      supabase
        .from('products')
        .select(
          'id, name, sku, category_id, cost_price, selling_price, current_stock, reorder_level, is_active, tracks_expiry, categories(name)'
        )
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true }),
    ]);

    if (prodRes.error) {
      setError(prodRes.error.message);
    } else {
      setProducts((prodRes.data as unknown as Product[]) || []);
    }

    if (!catRes.error && catRes.data) {
      const cats = catRes.data as Category[];
      setCategories(cats);
      if (!selectedCategoryId && cats.length > 0) {
        setSelectedCategoryId(cats[0].id);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProductsAndCategories();
  }, []);

  // Determine active category name in the Add Product form
  const activeCategoryName = useMemo(() => {
    if (categoryMode === 'new') {
      return newCategoryName.trim();
    }
    const found = categories.find((c) => c.id === selectedCategoryId);
    return found?.name || '';
  }, [categoryMode, newCategoryName, categories, selectedCategoryId]);

  // Auto-suggest next free SKU whenever category changes (unless manager edited SKU manually)
  useEffect(() => {
    if (!isAddOpen || skuManuallyEdited) return;
    if (activeCategoryName) {
      setSku(suggestNextSku(activeCategoryName, products));
    }
  }, [isAddOpen, activeCategoryName, products, skuManuallyEdited]);

  const openAddModal = () => {
    const defaultCat = categories[0];
    setName('');
    setCategoryMode(categories.length > 0 ? 'existing' : 'new');
    setSelectedCategoryId(defaultCat?.id || '');
    setNewCategoryName('');
    setSkuManuallyEdited(false);
    setSku(
      defaultCat ? suggestNextSku(defaultCat.name, products) : 'PRD-001'
    );
    setCostPrice('');
    setSellingPrice('');
    setOpeningStock('0');
    setReorderLevel('15');
    setTracksExpiry(false);
    setOpeningExpiryDate('');
    setFormError(null);
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    if (submitting) return;
    setIsAddOpen(false);
    setFormError(null);
  };

  // Non-blocking warning if selling price is below cost price
  const parsedCost = Number(costPrice);
  const parsedPrice = Number(sellingPrice);
  const showBelowCostWarning =
    costPrice.trim() !== '' &&
    sellingPrice.trim() !== '' &&
    Number.isFinite(parsedCost) &&
    Number.isFinite(parsedPrice) &&
    parsedCost > 0 &&
    parsedPrice > 0 &&
    parsedPrice < parsedCost;

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedSku = sku.trim().toUpperCase();

    if (!trimmedName) {
      setFormError('Product name is required.');
      return;
    }

    if (!trimmedSku) {
      setFormError('SKU is required.');
      return;
    }

    // Check if SKU is already taken locally
    const duplicateLocal = products.some(
      (p) => p.sku.toUpperCase() === trimmedSku
    );
    if (duplicateLocal) {
      setFormError(
        `SKU "${trimmedSku}" is already taken. Please choose a different SKU.`
      );
      return;
    }

    // Validate whole RWF numbers > 0 for prices
    const costNum = Number(costPrice);
    const priceNum = Number(sellingPrice);
    if (
      !costPrice.trim() ||
      !Number.isInteger(costNum) ||
      costNum <= 0
    ) {
      setFormError('Cost price must be a whole RWF number greater than 0.');
      return;
    }

    if (
      !sellingPrice.trim() ||
      !Number.isInteger(priceNum) ||
      priceNum <= 0
    ) {
      setFormError('Selling price must be a whole RWF number greater than 0.');
      return;
    }

    // Validate opening stock and reorder level (whole numbers >= 0)
    const stockNum = Number(openingStock);
    const reorderNum = Number(reorderLevel);
    if (
      openingStock.trim() === '' ||
      !Number.isInteger(stockNum) ||
      stockNum < 0
    ) {
      setFormError('Opening stock must be a whole number 0 or greater.');
      return;
    }

    if (
      reorderLevel.trim() === '' ||
      !Number.isInteger(reorderNum) ||
      reorderNum < 0
    ) {
      setFormError('Reorder level must be a whole number 0 or greater.');
      return;
    }

    // If tracks_expiry is on and opening stock > 0, require a future expiry date
    if (tracksExpiry && stockNum > 0) {
      if (!openingExpiryDate) {
        setFormError(
          'An expiry date is required for the opening batch when "Tracks expiry" is enabled and opening stock is above 0.'
        );
        return;
      }
      if (openingExpiryDate <= todayStr) {
        setFormError(
          'Opening batch expiry date must be in the future (after today).'
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      // 1. Resolve category_id (existing or create new inline)
      let categoryIdToUse = selectedCategoryId;

      if (categoryMode === 'new') {
        const trimmedNewCat = newCategoryName.trim();
        if (!trimmedNewCat) {
          setFormError('Please enter a name for the new category.');
          setSubmitting(false);
          return;
        }

        // Check if category already exists case-insensitively
        const existingCat = categories.find(
          (c) => c.name.toLowerCase() === trimmedNewCat.toLowerCase()
        );

        if (existingCat) {
          categoryIdToUse = existingCat.id;
        } else {
          const { data: createdCat, error: catErr } = await supabase
            .from('categories')
            .insert({ name: trimmedNewCat })
            .select('id, name')
            .single();

          if (catErr || !createdCat) {
            setFormError(
              `Failed to create category: ${catErr?.message || 'Unknown error'}`
            );
            setSubmitting(false);
            return;
          }
          categoryIdToUse = createdCat.id;
        }
      } else if (!categoryIdToUse) {
        setFormError('Please select a category.');
        setSubmitting(false);
        return;
      }

      // 2. Check database uniqueness for SKU (including inactive products)
      const { data: existingSkuRow } = await supabase
        .from('products')
        .select('id')
        .ilike('sku', trimmedSku)
        .maybeSingle();

      if (existingSkuRow) {
        setFormError(
          `SKU "${trimmedSku}" is already taken. Please enter a unique SKU.`
        );
        setSubmitting(false);
        return;
      }

      // 3. Insert product with current_stock: 0 initially.
      // Why current_stock is inserted as 0 when openingStock > 0:
      // The database trigger `trg_stock_movement_after_insert` automatically adds
      // `NEW.quantity` to `products.current_stock` whenever a 'delivery' movement is
      // inserted. Inserting current_stock = 0 and then logging the 'delivery' stock
      // movement ensures opening stock is recorded once and never double-counted.
      const { data: insertedProduct, error: prodInsertErr } = await supabase
        .from('products')
        .insert({
          name: trimmedName,
          sku: trimmedSku,
          category_id: categoryIdToUse,
          cost_price: costNum,
          selling_price: priceNum,
          current_stock: 0,
          reorder_level: reorderNum,
          is_active: true,
          tracks_expiry: tracksExpiry,
        })
        .select('id')
        .single();

      if (prodInsertErr || !insertedProduct) {
        const isUniqueViolation =
          prodInsertErr?.code === '23505' ||
          prodInsertErr?.message?.toLowerCase().includes('unique') ||
          prodInsertErr?.message?.toLowerCase().includes('sku');
        setFormError(
          isUniqueViolation
            ? `SKU "${trimmedSku}" is already taken. Please enter a unique SKU.`
            : `Failed to add product: ${prodInsertErr?.message}`
        );
        setSubmitting(false);
        return;
      }

      // 4. If opening stock > 0, log it as a 'delivery' stock movement
      //    (the trigger increases products.current_stock by stockNum).
      if (stockNum > 0) {
        const { error: moveErr } = await supabase
          .from('stock_movements')
          .insert({
            product_id: insertedProduct.id,
            quantity: stockNum,
            type: 'delivery',
            note: 'Opening stock',
            created_by: user?.id,
          });

        if (moveErr) {
          setFormError(
            `Product created, but failed to log opening stock movement: ${moveErr.message}`
          );
          setSubmitting(false);
          await loadProductsAndCategories();
          return;
        }

        // If tracks_expiry is on, create the opening batch in stock_batches
        if (tracksExpiry) {
          const { error: batchErr } = await supabase
            .from('stock_batches')
            .insert({
              product_id: insertedProduct.id,
              received_on: todayStr,
              expiry_date: openingExpiryDate,
              quantity_received: stockNum,
              quantity_remaining: stockNum,
              status: 'active',
              loss_amount: 0,
            });

          if (batchErr) {
            setFormError(
              `Product created, but failed to create opening expiry batch: ${batchErr.message}`
            );
            setSubmitting(false);
            await loadProductsAndCategories();
            return;
          }
        }
      }

      setSubmitting(false);
      setIsAddOpen(false);
      await loadProductsAndCategories();
    } catch (err) {
      setSubmitting(false);
      setFormError(
        err instanceof Error ? err.message : 'Failed to save product.'
      );
    }
  };

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const categoryName = product.categories?.name?.toLowerCase() || '';
    return (
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query) ||
      categoryName.includes(query)
    );
  });

  const lowStockCount = products.filter(
    (p) => p.current_stock <= p.reorder_level
  ).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-sm)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="text-headline-sm">Products</h1>
          <p
            className="text-body-sm"
            style={{
              color: 'var(--color-secondary)',
              marginTop: '4px',
            }}
          >
            Active supermarket inventory and RWF pricing ({products.length}{' '}
            items, {lowStockCount} low stock).
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ width: '260px' }}>
            <Input
              placeholder="Filter by product or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter products"
            />
          </div>

          {isManager && (
            <Button variant="primary" onClick={openAddModal}>
              <Plus size={16} />
              Add product
            </Button>
          )}
        </div>
      </div>

      {/* Add Product Modal (Manager Only) */}
      {isManager && isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-product-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(10, 10, 10, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-md)',
            zIndex: 50,
          }}
        >
          <Card
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: 'var(--space-md)',
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-sm)',
              }}
            >
              <div>
                <h2 id="add-product-title" className="text-headline-sm">
                  Add product
                </h2>
                <p
                  className="text-body-sm"
                  style={{ color: 'var(--color-secondary)', marginTop: '2px' }}
                >
                  Create a new supermarket product with whole RWF pricing.
                </p>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn--link"
                onClick={closeAddModal}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleAddProductSubmit}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
              }}
            >
              <Input
                id="new-product-name"
                label="Product name"
                placeholder="e.g. Inyange Passion Fruit Juice 500ml"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              {/* Category selector or inline creation */}
              <div className="ui-input-field">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <label
                    htmlFor="new-product-category"
                    className="ui-input-label text-label-md"
                  >
                    Category
                  </label>
                  <button
                    type="button"
                    className="ui-btn ui-btn--link text-label-sm"
                    style={{ color: 'var(--color-primary)' }}
                    onClick={() => {
                      setCategoryMode((prev) =>
                        prev === 'existing' ? 'new' : 'existing'
                      );
                    }}
                  >
                    {categoryMode === 'existing'
                      ? '+ Create new category'
                      : 'Choose existing category'}
                  </button>
                </div>

                {categoryMode === 'existing' ? (
                  <select
                    id="new-product-category"
                    className="ui-input"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    required
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="new-product-category"
                    className="ui-input"
                    placeholder="Enter new category name (e.g. Frozen Foods)"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    required
                  />
                )}
              </div>

              <Input
                id="new-product-sku"
                label="SKU (auto-suggested, editable, must be unique)"
                placeholder="e.g. DRK-009"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value.toUpperCase());
                  setSkuManuallyEdited(true);
                }}
                required
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-sm)',
                }}
              >
                <Input
                  id="new-product-cost"
                  label="Cost price (RWF)"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="e.g. 1200"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  required
                />

                <Input
                  id="new-product-price"
                  label="Selling price (RWF)"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="e.g. 1500"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  required
                />
              </div>

              {showBelowCostWarning && (
                <div
                  className="text-body-sm"
                  style={{
                    backgroundColor: '#FFF8E6',
                    color: '#946200',
                    border: '1px solid #F0D999',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  Warning: Selling price ({formatRWF(parsedPrice)}) is below
                  cost price ({formatRWF(parsedCost)}). You can still save if
                  this is intentional.
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-sm)',
                }}
              >
                <Input
                  id="new-product-stock"
                  label="Opening stock"
                  type="number"
                  min={0}
                  step={1}
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  required
                />

                <Input
                  id="new-product-reorder"
                  label="Reorder level"
                  type="number"
                  min={0}
                  step={1}
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  required
                />
              </div>

              {/* Tracks expiry toggle */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                  padding: '10px 12px',
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <label
                  className="text-body-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={tracksExpiry}
                    onChange={(e) => setTracksExpiry(e.target.checked)}
                  />
                  <span>
                    <strong>Tracks expiry</strong> (perishable product managed by
                    expiry batches)
                  </span>
                </label>

                {tracksExpiry && (Number(openingStock) || 0) > 0 && (
                  <div style={{ marginTop: 'var(--space-xs)' }}>
                    <Input
                      id="new-product-opening-expiry"
                      label="Opening batch expiry date (required, must be in the future)"
                      type="date"
                      min={todayStr}
                      value={openingExpiryDate}
                      onChange={(e) => setOpeningExpiryDate(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              {formError && (
                <div
                  className="text-body-sm"
                  style={{
                    color: 'var(--color-error)',
                    backgroundColor: '#FCECEC',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {formError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-xs)',
                  marginTop: 'var(--space-xs)',
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeAddModal}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save product'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <Card>
        {loading ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            Loading products...
          </div>
        ) : error ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-error)',
            }}
          >
            Failed to load products: {error}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            No products found.
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  {isManager && <th>Cost</th>}
                  <th>Price</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const isLowStock =
                    product.current_stock <= product.reorder_level;

                  return (
                    <tr key={product.id}>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-xs)',
                          }}
                        >
                          <span className="text-label-lg">{product.name}</span>
                          {product.tracks_expiry && (
                            <Chip variant="active">Tracks expiry</Chip>
                          )}
                        </div>
                        <div
                          className="text-label-sm"
                          style={{ color: 'var(--color-secondary)' }}
                        >
                          {product.sku}
                        </div>
                      </td>
                      <td>
                        <Chip>
                          {product.categories?.name || 'Uncategorized'}
                        </Chip>
                      </td>
                      {isManager && (
                        <td className="text-body-sm">
                          {formatRWF(product.cost_price)}
                        </td>
                      )}
                      <td className="text-label-lg">
                        {formatRWF(product.selling_price)}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-xs)',
                          }}
                        >
                          <span className="text-label-lg">
                            {product.current_stock}
                          </span>
                          {isLowStock && (
                            <Chip variant="error">Low stock</Chip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
