'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { formatNaira } from '@/lib/format';
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
  type ProductInput,
} from '@/lib/actions/products';

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  buy_price?: number | null;
  sell_price?: number | null;
};

export default function ProductManager({
  products,
  showPrices = true,
}: {
  products: ProductRow[];
  showPrices?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    router.refresh();
  }

  return (
    <>
      <section className="dash-section">
        <div className="dash-section-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2 className="dash-section-title">Products · {products.length}</h2>
          {!creating ? (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setEditingId(null);
              }}
              className="dash-badge ok"
              style={{
                cursor: 'pointer',
                padding: '6px 14px',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              + Add product
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="dash-badge"
              style={{ cursor: 'pointer', padding: '6px 14px' }}
            >
              Cancel
            </button>
          )}
        </div>

        {creating && (
          <ProductForm
            showPrices={showPrices}
            submitLabel="Add"
            disabled={pending}
            onSubmit={(input) =>
              startTransition(async () => {
                const res = await createProductAction(input);
                if (res.ok) {
                  toast(res.message || 'Added', 'ok');
                  setCreating(false);
                  refresh();
                } else toast(res.error, 'err');
              })
            }
          />
        )}

        {products.length === 0 ? (
          <div className="dash-empty">
            No products yet. Add your first one above.
          </div>
        ) : (
          <div className="dash-table-wrap" style={{ marginTop: creating ? 12 : 0 }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right' }}>Low at</th>
                  {showPrices && (
                    <>
                      <th style={{ textAlign: 'right' }}>Buy</th>
                      <th style={{ textAlign: 'right' }}>Sell</th>
                    </>
                  )}
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) =>
                  editingId === p.id ? (
                    <tr key={p.id}>
                      <td colSpan={showPrices ? 7 : 5} style={{ padding: 12 }}>
                        <ProductForm
                          showPrices={showPrices}
                          submitLabel="Save"
                          disabled={pending}
                          initial={{
                            name: p.name,
                            sku: p.sku ?? '',
                            buyPrice: p.buy_price ?? null,
                            sellPrice: p.sell_price ?? null,
                            stockQuantity: p.stock_quantity ?? 0,
                            lowStockThreshold: p.low_stock_threshold ?? null,
                          }}
                          onCancel={() => setEditingId(null)}
                          onSubmit={(input) =>
                            startTransition(async () => {
                              const res = await updateProductAction(p.id, input);
                              if (res.ok) {
                                toast(res.message || 'Updated', 'ok');
                                setEditingId(null);
                                refresh();
                              } else toast(res.error, 'err');
                            })
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ color: 'var(--ts)' }}>{p.sku || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{p.stock_quantity ?? 0}</td>
                      <td style={{ textAlign: 'right', color: 'var(--ts)' }}>
                        {p.low_stock_threshold ?? '—'}
                      </td>
                      {showPrices && (
                        <>
                          <td style={{ textAlign: 'right', color: 'var(--ts)' }}>
                            {p.buy_price != null ? formatNaira(Number(p.buy_price)) : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {p.sell_price != null ? formatNaira(Number(p.sell_price)) : '—'}
                          </td>
                        </>
                      )}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(p.id);
                              setCreating(false);
                            }}
                            className="dash-badge"
                            style={{ cursor: 'pointer', padding: '4px 10px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Delete "${p.name}"?`)) return;
                              startTransition(async () => {
                                const res = await deleteProductAction(p.id);
                                if (res.ok) {
                                  toast(res.message || 'Deleted', 'warn');
                                  refresh();
                                } else toast(res.error, 'err');
                              });
                            }}
                            className="dash-badge"
                            style={{
                              background: 'var(--danger-bg)',
                              color: 'var(--danger)',
                              border: '1px solid var(--danger)',
                              cursor: 'pointer',
                              padding: '4px 10px',
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ProductForm({
  initial,
  showPrices,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ProductInput>;
  showPrices: boolean;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (input: ProductInput) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [buy, setBuy] = useState(
    initial?.buyPrice != null ? String(initial.buyPrice) : '',
  );
  const [sell, setSell] = useState(
    initial?.sellPrice != null ? String(initial.sellPrice) : '',
  );
  const [stock, setStock] = useState(
    initial?.stockQuantity != null ? String(initial.stockQuantity) : '',
  );
  const [low, setLow] = useState(
    initial?.lowStockThreshold != null ? String(initial.lowStockThreshold) : '',
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          sku,
          buyPrice: buy === '' ? null : Number(buy),
          sellPrice: sell === '' ? null : Number(sell),
          stockQuantity: stock === '' ? 0 : Number(stock),
          lowStockThreshold: low === '' ? null : Number(low),
        });
      }}
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: showPrices
          ? '2fr 1fr 1fr 1fr 1fr 1fr auto'
          : '2fr 1fr 1fr 1fr auto',
        alignItems: 'end',
        padding: 12,
        background: 'var(--surface-2)',
        borderRadius: 10,
        marginBottom: 12,
      }}
    >
      <Field label="Name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Crate of malt"
          required
          style={inputStyle}
        />
      </Field>
      <Field label="SKU">
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="SKU-001"
          style={inputStyle}
        />
      </Field>
      <Field label="Stock">
        <input
          type="number"
          min="0"
          step="1"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="0"
          style={inputStyle}
        />
      </Field>
      <Field label="Low at">
        <input
          type="number"
          min="0"
          step="1"
          value={low}
          onChange={(e) => setLow(e.target.value)}
          placeholder="—"
          style={inputStyle}
        />
      </Field>
      {showPrices && (
        <>
          <Field label="Buy ₦">
            <input
              type="number"
              min="0"
              step="0.01"
              value={buy}
              onChange={(e) => setBuy(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </Field>
          <Field label="Sell ₦">
            <input
              type="number"
              min="0"
              step="0.01"
              value={sell}
              onChange={(e) => setSell(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </Field>
        </>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="dash-badge"
            style={{ cursor: 'pointer', padding: '8px 12px', height: 36 }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={disabled}
          className="dash-badge ok"
          style={{
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 700,
            height: 36,
          }}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--tm)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          fontWeight: 600,
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--tp)',
  fontSize: 13,
  outline: 'none',
};
