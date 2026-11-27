import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatRWF } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { StockBatch } from '../types/database';
import { getTodayLocalStr } from '../lib/alerts';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';

type ExpiryFilter = 'expired' | 'within_7' | 'within_30' | 'written_off';

function computeDaysDifference(expiryDateStr: string, todayStr: string): number {
  const [ey, em, ed] = expiryDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const expiryUtc = Date.UTC(ey, em - 1, ed);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((expiryUtc - todayUtc) / 86400000);
}

export const ExpiryPage: React.FC = () => {
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';

  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ExpiryFilter>('expired');

  const todayStr = useMemo(() => getTodayLocalStr(), []);

  const loadBatches = async () => {
    setLoading(true);
    setErrorMsg(null);

    // Read from role-aware stock_batches_view so clerks never receive cost_price or loss_amount
    const { data, error } = await supabase
      .from('stock_batches_view')
      .select('*')
      .order('expiry_date', { ascending: true });

    if (error) {
      setErrorMsg(`Failed to load stock batches: ${error.message}`);
    } else {
      setBatches((data as StockBatch[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBatches();
  }, []);

  // Categorize batches and compute summary KPIs
  const {
    expiredBatches,
    within7Batches,
    within30Batches,
    writtenOffBatches,
    stats,
  } = useMemo(() => {
    const expired: Array<StockBatch & { daysLeft: number }> = [];
    const within7: Array<StockBatch & { daysLeft: number }> = [];
    const within30: Array<StockBatch & { daysLeft: number }> = [];
    const writtenOff: Array<StockBatch & { daysLeft: number }> = [];

    let expiredUnits = 0;
    let expiredCost = 0;
    let within7Units = 0;
    let within7Cost = 0;
    let within30Units = 0;
    let within30Cost = 0;

    for (const b of batches) {
      const daysLeft = computeDaysDifference(b.expiry_date, todayStr);
      const enriched = { ...b, daysLeft };

      if (b.status === 'written_off') {
        writtenOff.push(enriched);
        continue;
      }

      // Only active batches with remaining stock > 0 are counted in active expiry buckets
      if (b.quantity_remaining <= 0) {
        continue;
      }

      const batchCostValue = Number(b.value_at_cost ?? 0);

      if (daysLeft < 0) {
        expired.push(enriched);
        expiredUnits += b.quantity_remaining;
        expiredCost += batchCostValue;
      } else {
        if (daysLeft <= 7) {
          within7.push(enriched);
          within7Units += b.quantity_remaining;
          within7Cost += batchCostValue;
        }
        if (daysLeft <= 30) {
          within30.push(enriched);
          within30Units += b.quantity_remaining;
          within30Cost += batchCostValue;
        }
      }
    }

    return {
      expiredBatches: expired,
      within7Batches: within7,
      within30Batches: within30,
      writtenOffBatches: writtenOff,
      stats: {
        expiredUnits,
        expiredCost,
        within7Units,
        within7Cost,
        within30Units,
        within30Cost,
      },
    };
  }, [batches, todayStr]);

  const visibleBatches = useMemo(() => {
    switch (activeFilter) {
      case 'expired':
        return expiredBatches;
      case 'within_7':
        return within7Batches;
      case 'within_30':
        return within30Batches;
      case 'written_off':
        return writtenOffBatches;
    }
  }, [
    activeFilter,
    expiredBatches,
    within7Batches,
    within30Batches,
    writtenOffBatches,
  ]);

  const handleWriteOffSingle = async (
    batch: StockBatch & { daysLeft: number }
  ) => {
    const confirmed = window.confirm(
      `Write off ${batch.quantity_remaining} unit(s) of "${batch.product_name}" (expiry ${batch.expiry_date})? This will mark the batch as written off and deduct ${batch.quantity_remaining} unit(s) from current stock.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { error } = await supabase.rpc('write_off_batch', {
      p_batch_id: batch.id,
    });

    setActionLoading(false);

    if (error) {
      setErrorMsg(`Failed to write off batch: ${error.message}`);
      return;
    }

    setSuccessMsg(
      `Wrote off ${batch.quantity_remaining} unit(s) of ${batch.product_name}.`
    );
    await loadBatches();
  };

  const handleWriteOffAllExpired = async () => {
    if (expiredBatches.length === 0) return;

    const confirmed = window.confirm(
      `Write off all ${expiredBatches.length} expired batch(es) (${stats.expiredUnits.toLocaleString()} total units)? This will deduct those units from current stock.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { data: count, error } = await supabase.rpc(
      'write_off_all_expired_batches'
    );

    setActionLoading(false);

    if (error) {
      setErrorMsg(`Failed to write off expired batches: ${error.message}`);
      return;
    }

    setSuccessMsg(`Successfully wrote off ${count ?? expiredBatches.length} expired batch(es).`);
    await loadBatches();
  };

  const filterTabs: Array<{
    key: ExpiryFilter;
    label: string;
    count: number;
  }> = [
    { key: 'expired', label: 'Expired', count: expiredBatches.length },
    {
      key: 'within_7',
      label: 'Expiring within 7 days',
      count: within7Batches.length,
    },
    {
      key: 'within_30',
      label: 'Expiring within 30 days',
      count: within30Batches.length,
    },
    {
      key: 'written_off',
      label: 'Written off',
      count: writtenOffBatches.length,
    },
  ];

  const formatDaysLeftLabel = (daysLeft: number): string => {
    if (daysLeft < 0) {
      const daysAgo = Math.abs(daysLeft);
      return `Expired ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
    }
    if (daysLeft === 0) {
      return 'Expires today';
    }
    return `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      {/* Header + Write off all expired action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-sm)',
        }}
      >
        <div>
          <h1 className="text-headline-sm">Expiry Tracking</h1>
          <p
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)', marginTop: '4px' }}
          >
            Monitor perishable batches, prevent expired sales, and record stock
            write-offs.
          </p>
        </div>

        <Button
          variant="primary"
          disabled={actionLoading || expiredBatches.length === 0}
          onClick={handleWriteOffAllExpired}
        >
          Write off all expired ({expiredBatches.length})
        </Button>
      </div>

      {/* Summary Cards: Expired units, Expiring within 7 days, Expiring within 30 days */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-sm)',
        }}
      >
        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Expired units
            </span>
            <Chip variant="error">{expiredBatches.length} batches</Chip>
          </div>
          <div
            className="text-headline-sm"
            style={{
              marginTop: 'var(--space-xs)',
              color:
                stats.expiredUnits > 0
                  ? 'var(--color-error)'
                  : 'var(--color-on-surface)',
            }}
          >
            {stats.expiredUnits.toLocaleString()} units
          </div>
          {isManager && (
            <div
              className="text-label-sm"
              style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
            >
              Value at cost: <strong>{formatRWF(stats.expiredCost)}</strong>
            </div>
          )}
        </Card>

        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Expiring within 7 days
            </span>
            <Chip variant="active">{within7Batches.length} batches</Chip>
          </div>
          <div
            className="text-headline-sm"
            style={{ marginTop: 'var(--space-xs)' }}
          >
            {stats.within7Units.toLocaleString()} units
          </div>
          {isManager && (
            <div
              className="text-label-sm"
              style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
            >
              Value at cost: <strong>{formatRWF(stats.within7Cost)}</strong>
            </div>
          )}
        </Card>

        <Card style={{ padding: 'var(--space-md)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              className="text-label-md"
              style={{ color: 'var(--color-secondary)' }}
            >
              Expiring within 30 days
            </span>
            <Chip>{within30Batches.length} batches</Chip>
          </div>
          <div
            className="text-headline-sm"
            style={{ marginTop: 'var(--space-xs)' }}
          >
            {stats.within30Units.toLocaleString()} units
          </div>
          {isManager && (
            <div
              className="text-label-sm"
              style={{ color: 'var(--color-secondary)', marginTop: '6px' }}
            >
              Value at cost: <strong>{formatRWF(stats.within30Cost)}</strong>
            </div>
          )}
        </Card>
      </div>

      {errorMsg && (
        <div
          className="text-body-sm"
          style={{
            color: 'var(--color-error)',
            backgroundColor: '#FCECEC',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          className="text-body-sm"
          style={{
            color: 'var(--color-primary)',
            backgroundColor: 'var(--color-primary-20)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Filter Chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-xs)',
        }}
      >
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <Chip variant={isActive ? 'active' : 'default'}>
                {tab.label} ({tab.count})
              </Chip>
            </button>
          );
        })}
      </div>

      {/* Batches Table */}
      <Card>
        {loading ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            Loading batches...
          </div>
        ) : visibleBatches.length === 0 ? (
          <div
            className="text-body-sm"
            style={{
              padding: 'var(--space-md)',
              color: 'var(--color-secondary)',
            }}
          >
            No batches in this view.
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Received date</th>
                  <th>Expiry date</th>
                  <th>Days left</th>
                  <th>Units</th>
                  {isManager && <th>Value at cost</th>}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleBatches.map((batch) => {
                  const isExpired = batch.daysLeft < 0;
                  const isSoon = batch.daysLeft >= 0 && batch.daysLeft <= 7;
                  const costToDisplay =
                    batch.status === 'written_off'
                      ? Number(batch.loss_amount ?? batch.value_at_cost ?? 0)
                      : Number(batch.value_at_cost ?? 0);

                  return (
                    <tr key={batch.id}>
                      <td>
                        <div className="text-label-lg">
                          {batch.product_name || 'Product'}
                        </div>
                        <div
                          className="text-label-sm"
                          style={{ color: 'var(--color-secondary)' }}
                        >
                          {batch.product_sku || '—'}
                        </div>
                      </td>
                      <td>{batch.received_on}</td>
                      <td>{batch.expiry_date}</td>
                      <td>
                        <Chip
                          variant={
                            isExpired
                              ? 'error'
                              : isSoon
                              ? 'active'
                              : 'default'
                          }
                        >
                          {formatDaysLeftLabel(batch.daysLeft)}
                        </Chip>
                      </td>
                      <td className="text-label-lg">
                        {batch.quantity_remaining.toLocaleString()}
                      </td>
                      {isManager && (
                        <td className="text-label-lg">
                          {formatRWF(costToDisplay)}
                        </td>
                      )}
                      <td>
                        {batch.status === 'written_off' ? (
                          <Chip>Written off</Chip>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={actionLoading}
                            onClick={() => handleWriteOffSingle(batch)}
                          >
                            Write off
                          </Button>
                        )}
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

