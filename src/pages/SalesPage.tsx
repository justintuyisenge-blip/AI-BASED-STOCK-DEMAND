import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatRWF } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Product, Sale, StockBatch } from '../types/database';
import {
  computeExpiredActiveUnitsByProduct,
  getSellableStock,
  getTodayLocalStr,
} from '../lib/alerts';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

interface CsvPreviewRow {
  rowNumber: number;
  date: string;
  sku: string;
  quantity: number;
  product?: Product;
  error?: string;
}

export const SalesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const isManager = profile?.role === 'manager';

  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Sale Form State
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [soldOn, setSoldOn] = useState<string>(getTodayLocalStr());
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // CSV Import State (Manager only)
  const [csvRows, setCsvRows] = useState<CsvPreviewRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [alsoAdjustStock, setAlsoAdjustStock] = useState<boolean>(false);
  const [importingCsv, setImportingCsv] = useState<boolean>(false);
  const [csvMessage, setCsvMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);

    // 1. Load active products and stock_batches_view (for sellable stock calculation)
    const [prodRes, batchRes] = await Promise.all([
      supabase
        .from('products')
        .select(
          'id, name, sku, category_id, cost_price, selling_price, current_stock, reorder_level, is_active, tracks_expiry'
        )
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase.from('stock_batches_view').select('*'),
    ]);

    const loadedProducts = (prodRes.data as Product[]) || [];
    setProducts(loadedProducts);
    setBatches((batchRes.data as StockBatch[]) || []);

    if (!selectedProductId && loadedProducts.length > 0) {
      setSelectedProductId(loadedProducts[0].id);
    }

    // 2. Load recent sales (Managers: latest 50; Clerks: only their own sales recorded today)
    let salesQuery = supabase
      .from('sales')
      .select(
        'id, product_id, quantity, unit_price, sold_on, created_by, products(name, sku)'
      )
      .order('sold_on', { ascending: false })
      .limit(50);

    if (!isManager && user) {
      salesQuery = salesQuery
        .eq('created_by', user.id)
        .eq('sold_on', getTodayLocalStr());
    }

    const { data: salesData } = await salesQuery;
    setRecentSales((salesData as unknown as Sale[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [isManager, user?.id]);

  // Compute expired active units per product so sellableStock = current_stock - expiredUnits
  const expiredUnitsByProduct = useMemo(
    () => computeExpiredActiveUnitsByProduct(batches),
    [batches]
  );

  // Filter products by search input
  const matchingProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  // Keep selectedProductId synchronized when search narrows list
  useEffect(() => {
    if (
      matchingProducts.length > 0 &&
      !matchingProducts.some((p) => p.id === selectedProductId)
    ) {
      setSelectedProductId(matchingProducts[0].id);
    }
  }, [matchingProducts, selectedProductId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const selectedSellableStock = useMemo(() => {
    if (!selectedProduct) return 0;
    return getSellableStock(selectedProduct, expiredUnitsByProduct);
  }, [selectedProduct, expiredUnitsByProduct]);

  const selectedExpiredUnits = useMemo(() => {
    if (!selectedProduct || !selectedProduct.tracks_expiry) return 0;
    return expiredUnitsByProduct.get(selectedProduct.id) || 0;
  }, [selectedProduct, expiredUnitsByProduct]);

  const parsedQty = Math.max(0, parseInt(quantity, 10) || 0);
  const lineTotal = selectedProduct
    ? parsedQty * selectedProduct.selling_price
    : 0;

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!selectedProduct) {
      setFormError('Please select a product.');
      return;
    }

    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      setFormError('Quantity must be a whole number greater than 0.');
      return;
    }

    if (!soldOn) {
      setFormError('Please select a sale date.');
      return;
    }

    setSubmitting(true);

    // Fetch latest product stock and batches from database to prevent overselling or selling expired units
    const [freshProdRes, freshBatchRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, current_stock, name, tracks_expiry')
        .eq('id', selectedProduct.id)
        .single(),
      supabase
        .from('stock_batches_view')
        .select('*')
        .eq('product_id', selectedProduct.id)
        .eq('status', 'active'),
    ]);

    const freshProduct = freshProdRes.data;
    if (freshProdRes.error || !freshProduct) {
      setSubmitting(false);
      setFormError('Could not verify current stock level. Please try again.');
      return;
    }

    const todayStr = getTodayLocalStr();
    const productBatches = (freshBatchRes.data as StockBatch[]) || [];

    if (freshProduct.tracks_expiry) {
      // Sellable stock = current_stock minus units in expired active batches
      const expiredUnits = productBatches
        .filter((b) => b.quantity_remaining > 0 && b.expiry_date < todayStr)
        .reduce((sum, b) => sum + b.quantity_remaining, 0);

      const inDateSellableUnits = Math.max(
        0,
        freshProduct.current_stock - expiredUnits
      );

      if (parsedQty > inDateSellableUnits) {
        setSubmitting(false);
        setFormError(
          `Cannot record sale for "${freshProduct.name}": only ${inDateSellableUnits} units are in date (requested ${parsedQty} units${
            expiredUnits > 0 ? `; ${expiredUnits} units in stock are expired` : ''
          }).`
        );
        return;
      }
    } else if (parsedQty > freshProduct.current_stock) {
      setSubmitting(false);
      setFormError(
        `Insufficient stock: cannot sell ${parsedQty} units of "${freshProduct.name}" because only ${freshProduct.current_stock} units are available in stock.`
      );
      return;
    }

    const { error: insertError } = await supabase.from('sales').insert({
      product_id: selectedProduct.id,
      quantity: parsedQty,
      unit_price: selectedProduct.selling_price,
      unit_cost: selectedProduct.cost_price,
      sold_on: soldOn,
      created_by: user?.id,
    });

    setSubmitting(false);

    if (insertError) {
      setFormError(`Failed to save sale: ${insertError.message}`);
      return;
    }

    setFormSuccess(
      `Sale recorded: ${parsedQty} × ${selectedProduct.name} (${formatRWF(
        lineTotal
      )}).`
    );
    setQuantity('1');
    await loadData();
  };

  // Parse uploaded CSV file (columns: date, sku, quantity)
  const handleCsvFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setCsvMessage(null);
    const file = e.target.files?.[0];
    if (!file) {
      setCsvRows([]);
      setCsvFileName('');
      return;
    }

    setCsvFileName(file.name);
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      setCsvRows([]);
      setCsvMessage({ type: 'error', text: 'The selected CSV file is empty.' });
      return;
    }

    const productBySku = new Map<string, Product>();
    for (const p of products) {
      productBySku.set(p.sku.toUpperCase(), p);
    }

    const parsed: CsvPreviewRow[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());

      // Skip header line if present
      if (
        i === 0 &&
        (cols[0]?.toLowerCase() === 'date' || cols[1]?.toLowerCase() === 'sku')
      ) {
        continue;
      }

      const [rawDate = '', rawSku = '', rawQty = ''] = cols;
      const qtyNum = Number(rawQty);
      const matchedProduct = productBySku.get(rawSku.toUpperCase());

      let rowError: string | undefined;
      if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        rowError = `Invalid date "${rawDate}" (use YYYY-MM-DD)`;
      } else if (!rawSku) {
        rowError = 'Missing SKU';
      } else if (!matchedProduct) {
        rowError = `Unknown SKU "${rawSku}"`;
      } else if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
        rowError = `Invalid quantity "${rawQty}"`;
      }

      parsed.push({
        rowNumber: i + 1,
        date: rawDate,
        sku: rawSku,
        quantity: Number.isFinite(qtyNum) ? qtyNum : 0,
        product: matchedProduct,
        error: rowError,
      });
    }

    setCsvRows(parsed);
  };

  const invalidCsvRows = csvRows.filter((r) => Boolean(r.error));
  const validCsvRows = csvRows.filter((r) => !r.error && r.product);

  const handleImportCsv = async () => {
    if (csvRows.length === 0) return;

    if (invalidCsvRows.length > 0) {
      setCsvMessage({
        type: 'error',
        text: `Please fix the ${invalidCsvRows.length} invalid row(s) (such as unknown SKUs) before importing.`,
      });
      return;
    }

    setImportingCsv(true);
    setCsvMessage(null);

    const payload = validCsvRows.map((r) => ({
      product_id: r.product!.id,
      quantity: r.quantity,
      unit_price: r.product!.selling_price,
      unit_cost: r.product!.cost_price,
      sold_on: r.date,
    }));

    // Call RPC in batches of 500 rows
    const BATCH_SIZE = 500;
    let totalImported = 0;

    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const chunk = payload.slice(i, i + BATCH_SIZE);
      const { data: count, error: rpcError } = await supabase.rpc(
        'import_historical_sales',
        {
          p_rows: chunk,
          p_adjust_stock: alsoAdjustStock,
        }
      );

      if (rpcError) {
        setImportingCsv(false);
        setCsvMessage({
          type: 'error',
          text: `CSV import failed: ${rpcError.message}`,
        });
        return;
      }

      totalImported += Number(count || chunk.length);
    }

    setImportingCsv(false);
    setCsvRows([]);
    setCsvFileName('');
    setCsvMessage({
      type: 'success',
      text: `Successfully imported ${totalImported} sales row(s) (${
        alsoAdjustStock ? 'stock adjusted' : 'current_stock and batches unchanged'
      }).`,
    });
    await loadData();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      <div>
        <h1 className="text-headline-sm">Sales</h1>
        <p
          className="text-body-sm"
          style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
        >
          Record customer purchases and automatically update supermarket stock
          (earliest expiry first for perishable items).
        </p>
      </div>

      {/* 1. Record a Sale Form */}
      <Card style={{ padding: 'var(--space-md)' }}>
        <h2
          className="text-label-lg"
          style={{ marginBottom: 'var(--space-sm)' }}
        >
          Record new sale
        </h2>

        <form
          onSubmit={handleRecordSale}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-sm)',
            }}
          >
            <Input
              id="product-search"
              label="Search product (name or SKU)"
              placeholder="Type to filter products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />

            <div className="ui-input-field">
              <label
                htmlFor="product-select"
                className="ui-input-label text-label-md"
              >
                Select product ({matchingProducts.length})
              </label>
              <select
                id="product-select"
                className="ui-input"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
              >
                {matchingProducts.length === 0 ? (
                  <option value="">No matching products</option>
                ) : (
                  matchingProducts.map((p) => {
                    const sellable = getSellableStock(p, expiredUnitsByProduct);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) — Available: {sellable}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <Input
              id="sale-quantity"
              label="Quantity"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />

            <Input
              id="sale-date"
              label="Date"
              type="date"
              value={soldOn}
              onChange={(e) => setSoldOn(e.target.value)}
              required
            />
          </div>

          {/* Automatic Unit Price, (Manager-only Unit Cost), Sellable Stock & Line Total Summary */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-sm)',
              padding: 'var(--space-sm)',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-md)',
              }}
            >
              <div>
                <div
                  className="text-label-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Available stock (in date)
                </div>
                <div className="text-label-lg">
                  {selectedProduct
                    ? `${selectedSellableStock} units${
                        selectedExpiredUnits > 0
                          ? ` (${selectedExpiredUnits} expired)`
                          : ''
                      }`
                    : '—'}
                </div>
              </div>

              <div>
                <div
                  className="text-label-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Unit price (auto)
                </div>
                <div className="text-label-lg">
                  {selectedProduct
                    ? formatRWF(selectedProduct.selling_price)
                    : '—'}
                </div>
              </div>

              {isManager && (
                <div>
                  <div
                    className="text-label-sm"
                    style={{ color: 'var(--color-secondary)' }}
                  >
                    Unit cost (auto)
                  </div>
                  <div className="text-label-lg">
                    {selectedProduct
                      ? formatRWF(selectedProduct.cost_price)
                      : '—'}
                  </div>
                </div>
              )}

              <div>
                <div
                  className="text-label-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  Line total
                </div>
                <div
                  className="text-label-lg"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {formatRWF(lineTotal)}
                </div>
              </div>
            </div>

            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving sale...' : 'Save sale'}
            </Button>
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

          {formSuccess && (
            <div
              className="text-body-sm"
              style={{
                color: 'var(--color-primary)',
                backgroundColor: 'var(--color-primary-20)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {formSuccess}
            </div>
          )}
        </form>
      </Card>

      {/* 2. Manager-Only CSV Import */}
      {isManager && (
        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-sm)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            <div>
              <h2 className="text-label-lg">Import historical sales (CSV)</h2>
              <p
                className="text-body-sm"
                style={{ color: 'var(--color-secondary)', marginTop: '2px' }}
              >
                Required CSV columns: <code>date, sku, quantity</code> (e.g.{' '}
                <code>2026-11-15, DRY-001, 4</code>).
              </p>
            </div>
            <Chip variant="active">Manager only</Chip>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 'var(--space-md)',
            }}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileChange}
              className="text-body-sm"
            />

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
                checked={alsoAdjustStock}
                onChange={(e) => setAlsoAdjustStock(e.target.checked)}
              />
              Also adjust stock (default off for historical sales)
            </label>
          </div>

          {csvMessage && (
            <div
              className="text-body-sm"
              style={{
                marginTop: 'var(--space-sm)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                color:
                  csvMessage.type === 'error'
                    ? 'var(--color-error)'
                    : 'var(--color-primary)',
                backgroundColor:
                  csvMessage.type === 'error'
                    ? '#FCECEC'
                    : 'var(--color-primary-20)',
              }}
            >
              {csvMessage.text}
            </div>
          )}

          {csvRows.length > 0 && (
            <div
              style={{
                marginTop: 'var(--space-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--space-sm)',
                }}
              >
                <div className="text-body-sm">
                  Previewing <strong>{csvFileName}</strong>: {csvRows.length}{' '}
                  row(s) ({validCsvRows.length} valid, {invalidCsvRows.length}{' '}
                  with errors)
                </div>

                <Button
                  type="button"
                  variant="primary"
                  disabled={importingCsv || invalidCsvRows.length > 0}
                  onClick={handleImportCsv}
                >
                  {importingCsv
                    ? 'Importing...'
                    : `Import ${validCsvRows.length} row(s)`}
                </Button>
              </div>

              <div
                className="data-table-wrapper"
                style={{ maxHeight: '280px', overflowY: 'auto' }}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Date</th>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.date}</td>
                        <td>{row.sku}</td>
                        <td>{row.product?.name || '—'}</td>
                        <td>{row.quantity}</td>
                        <td>
                          {row.product
                            ? formatRWF(
                                row.quantity * row.product.selling_price
                              )
                            : '—'}
                        </td>
                        <td>
                          {row.error ? (
                            <Chip variant="error">{row.error}</Chip>
                          ) : (
                            <Chip variant="active">Ready</Chip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 3. Recent Sales List */}
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-xs) var(--space-sm) var(--space-sm)',
          }}
        >
          <div>
            <h2 className="text-label-lg">
              {isManager
                ? 'Recent sales (latest 50)'
                : 'Your sales recorded today'}
            </h2>
          </div>
          <Chip>{recentSales.length} shown</Chip>
        </div>

        {loading ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            Loading recent sales...
          </div>
        ) : recentSales.length === 0 ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            No sales found.
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  <th>Unit price</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.sold_on}</td>
                    <td className="text-label-lg">
                      {sale.products?.name || 'Product'}
                    </td>
                    <td>
                      <Chip>{sale.products?.sku || '—'}</Chip>
                    </td>
                    <td>{sale.quantity}</td>
                    <td>{formatRWF(sale.unit_price)}</td>
                    <td className="text-label-lg">
                      {formatRWF(sale.quantity * sale.unit_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
