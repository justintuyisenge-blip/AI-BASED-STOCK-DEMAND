import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Product, StockMovement } from '../types/database';
import { getTodayLocalStr } from '../lib/alerts';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

export const StockInPage: React.FC = () => {
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('10');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const todayStr = useMemo(() => getTodayLocalStr(), []);

  const loadData = async () => {
    setLoading(true);

    const { data: prodData } = await supabase
      .from('products')
      .select(
        'id, name, sku, category_id, cost_price, selling_price, current_stock, reorder_level, is_active, tracks_expiry'
      )
      .eq('is_active', true)
      .order('name', { ascending: true });

    const loadedProducts = (prodData as Product[]) || [];
    setProducts(loadedProducts);

    if (!selectedProductId && loadedProducts.length > 0) {
      setSelectedProductId(loadedProducts[0].id);
    }

    const { data: delivData } = await supabase
      .from('stock_movements')
      .select(
        'id, product_id, quantity, type, note, created_at, created_by, products(name, sku)'
      )
      .eq('type', 'delivery')
      .order('created_at', { ascending: false })
      .limit(50);

    setDeliveries((delivData as unknown as StockMovement[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const tracksExpiry = Boolean(selectedProduct?.tracks_expiry);

  const handleSaveDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const parsedQty = parseInt(quantity, 10);
    if (!selectedProductId || !selectedProduct) {
      setFormError('Please select a product.');
      return;
    }

    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      setFormError('Delivery quantity must be a whole number greater than 0.');
      return;
    }

    if (tracksExpiry) {
      if (!expiryDate) {
        setFormError(
          `Expiry date is required for "${selectedProduct.name}" because it tracks expiry.`
        );
        return;
      }
      if (expiryDate <= todayStr) {
        setFormError(
          'Expiry date must be in the future (after today).'
        );
        return;
      }
    }

    setSubmitting(true);

    // 1. Insert delivery stock movement (trigger increases products.current_stock)
    const { error: insertError } = await supabase
      .from('stock_movements')
      .insert({
        product_id: selectedProductId,
        quantity: parsedQty,
        type: 'delivery',
        note: note.trim() ? note.trim() : null,
        created_by: user?.id,
      });

    if (insertError) {
      setSubmitting(false);
      setFormError(`Failed to record delivery: ${insertError.message}`);
      return;
    }

    // 2. If product tracks expiry, create a batch in stock_batches
    if (tracksExpiry) {
      const { error: batchError } = await supabase
        .from('stock_batches')
        .insert({
          product_id: selectedProductId,
          received_on: todayStr,
          expiry_date: expiryDate,
          quantity_received: parsedQty,
          quantity_remaining: parsedQty,
          status: 'active',
          loss_amount: 0,
        });

      if (batchError) {
        setSubmitting(false);
        setFormError(
          `Delivery logged, but failed to create expiry batch: ${batchError.message}`
        );
        await loadData();
        return;
      }
    }

    setSubmitting(false);

    setFormSuccess(
      `Delivery logged: +${parsedQty} units added to ${
        selectedProduct.name
      }${tracksExpiry ? ` (batch expiry: ${expiryDate})` : ''}.`
    );
    setQuantity('10');
    setExpiryDate('');
    setNote('');
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
        <h1 className="text-headline-sm">Stock In</h1>
        <p
          className="text-body-sm"
          style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
        >
          Log supplier deliveries to replenish supermarket inventory.
        </p>
      </div>

      {/* Record Delivery Form */}
      <Card style={{ padding: 'var(--space-md)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-sm)',
          }}
        >
          <h2 className="text-label-lg">Log supplier delivery</h2>
          {tracksExpiry && (
            <Chip variant="active">Tracks expiry — batch required</Chip>
          )}
        </div>

        <form
          onSubmit={handleSaveDelivery}
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
            <div className="ui-input-field">
              <label
                htmlFor="delivery-product"
                className="ui-input-label text-label-md"
              >
                Product
              </label>
              <select
                id="delivery-product"
                className="ui-input"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — Current stock: {p.current_stock}
                    {p.tracks_expiry ? ' [Tracks expiry]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="delivery-quantity"
              label="Quantity received"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />

            {tracksExpiry && (
              <Input
                id="delivery-expiry-date"
                label="Expiry date (required, must be in the future)"
                type="date"
                min={todayStr}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
              />
            )}

            <Input
              id="delivery-note"
              label="Note (optional)"
              placeholder="e.g. Inyange weekly supplier truck"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 'var(--space-xs)',
            }}
          >
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving delivery...' : 'Save delivery'}
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

      {/* Recent Deliveries Table */}
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-xs) var(--space-sm) var(--space-sm)',
          }}
        >
          <h2 className="text-label-lg">Recent deliveries</h2>
          <Chip>{deliveries.length} shown</Chip>
        </div>

        {loading ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            Loading recent deliveries...
          </div>
        ) : deliveries.length === 0 ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            No deliveries recorded yet.
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date &amp; time</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Quantity added</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {new Date(item.created_at).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="text-label-lg">
                      {item.products?.name || 'Product'}
                    </td>
                    <td>
                      <Chip>{item.products?.sku || '—'}</Chip>
                    </td>
                    <td>
                      <Chip variant="active">+{item.quantity}</Chip>
                    </td>
                    <td
                      className="text-body-sm"
                      style={{ color: 'var(--color-secondary)' }}
                    >
                      {item.note || '—'}
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
