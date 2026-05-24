'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
  type CustomerInput,
} from '@/lib/actions/customers';

export type CustomerRow = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export default function CustomerManager({
  customers,
  canDelete = true,
}: {
  customers: CustomerRow[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="dash-section">
      <div className="dash-section-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h2 className="dash-section-title">Customers · {customers.length}</h2>
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
            + Add customer
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
        <CustomerForm
          submitLabel="Add"
          disabled={pending}
          onSubmit={(input) =>
            startTransition(async () => {
              const res = await createCustomerAction(input);
              if (res.ok) {
                toast(res.message || 'Added', 'ok');
                setCreating(false);
                router.refresh();
              } else toast(res.error, 'err');
            })
          }
        />
      )}

      {customers.length === 0 ? (
        <div className="dash-empty">No customers yet. Add your first one above.</div>
      ) : (
        <div className="dash-table-wrap" style={{ marginTop: creating ? 12 : 0 }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={5} style={{ padding: 12 }}>
                      <CustomerForm
                        submitLabel="Save"
                        disabled={pending}
                        initial={{
                          name: c.name,
                          phone: c.phone ?? '',
                          address: c.address ?? '',
                          notes: c.notes ?? '',
                        }}
                        onCancel={() => setEditingId(null)}
                        onSubmit={(input) =>
                          startTransition(async () => {
                            const res = await updateCustomerAction(c.id, input);
                            if (res.ok) {
                              toast(res.message || 'Updated', 'ok');
                              setEditingId(null);
                              router.refresh();
                            } else toast(res.error, 'err');
                          })
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: 'var(--ts)' }}>{c.phone || '—'}</td>
                    <td style={{ color: 'var(--ts)' }}>{c.address || '—'}</td>
                    <td style={{ color: 'var(--ts)' }}>{c.notes || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(c.id);
                            setCreating(false);
                          }}
                          className="dash-badge"
                          style={{ cursor: 'pointer', padding: '4px 10px' }}
                        >
                          Edit
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Delete "${c.name}"?`)) return;
                              startTransition(async () => {
                                const res = await deleteCustomerAction(c.id);
                                if (res.ok) {
                                  toast(res.message || 'Deleted', 'warn');
                                  router.refresh();
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
                        )}
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
  );
}

function CustomerForm({
  initial,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<CustomerInput>;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (input: CustomerInput) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, phone, address, notes });
      }}
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: '2fr 1fr 2fr 2fr auto',
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
          placeholder="Customer name"
          required
          style={inputStyle}
        />
      </Field>
      <Field label="Phone">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0816…"
          style={inputStyle}
        />
      </Field>
      <Field label="Address">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Optional"
          style={inputStyle}
        />
      </Field>
      <Field label="Notes">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
          style={inputStyle}
        />
      </Field>
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
