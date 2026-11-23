import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatRWF } from '../lib/format';
import { Product } from '../types/database';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Input } from '../components/ui/Input';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('products')
        .select('id, name, sku, category_id, cost_price, selling_price, current_stock, reorder_level, is_active, categories(name)')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setProducts((data as unknown as Product[]) || []);
      }

      setLoading(false);
    };

    loadProducts();
  }, []);

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
            Active supermarket inventory and RWF pricing ({products.length} items,{' '}
            {lowStockCount} low stock).
          </p>
        </div>

        <div style={{ width: '280px' }}>
          <Input
            placeholder="Filter by product or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter products"
          />
        </div>
      </div>

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
                  <th>Cost</th>
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
                        <div className="text-label-lg">{product.name}</div>
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
                      <td className="text-body-sm">
                        {formatRWF(product.cost_price)}
                      </td>
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

