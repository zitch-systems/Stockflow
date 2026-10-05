"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { friendlyError, searchTerm, type Customer } from "@/lib/domain";
import { Button, Dialog, Empty, Icon, Loading } from "./ui";

export default function CustomerPicker({ tenantId, onSelect, onClose }: {
  tenantId: string;
  onSelect: (customer: Customer | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        let query = getSupabase().from("customers")
          .select("id,name,phone,address,credit_limit")
          .eq("tenant_id", tenantId).order("name").order("id").limit(20);
        const term = searchTerm(search);
        if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
        const result = await query.abortSignal(controller.signal);
        if (result.error) throw result.error;
        if (!ignore) setCustomers(result.data as Customer[]);
      } catch (e) {
        if (!ignore) setError(friendlyError(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    }, 180);
    return () => { ignore = true; clearTimeout(timer); controller.abort(); };
  }, [tenantId, search, retry]);
  return <Dialog title="Find a customer" onClose={onClose}>
    <div className="sf-search">
      <Icon name="search" />
      <input aria-label="Search customers by name or phone" placeholder="Name or phone number"
        value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
      {search && <button aria-label="Clear customer search" onClick={() => setSearch("")}><Icon name="close" /></button>}
    </div>
    <Button variant="ghost" className="sf-walk-in" onClick={() => onSelect(null)}>Use walk-in customer</Button>
    {error ? <div className="sf-error" role="alert">{error}<Button variant="ghost" onClick={() => setRetry(n => n + 1)}>Retry</Button></div>
      : loading ? <Loading /> : customers.length ? <div className="sf-customer-options">
        {customers.map(c => <button key={c.id} onClick={() => onSelect(c)}>
          <span className="sf-avatar">{c.name.charAt(0)}</span><span><strong>{c.name}</strong><small>{c.phone || "No phone recorded"}</small></span><Icon name="arrow" />
        </button>)}
        <p className="sf-muted">Showing up to 20 customers. Search to narrow the list.</p>
      </div> : <Empty title={search ? "No matching customers" : "No saved customers yet"}
        description={search ? "Try another name or phone number, or use a walk-in customer." : "Add customers from More → Customers to link their purchase history."} />}
  </Dialog>;
}
