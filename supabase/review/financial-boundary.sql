-- REVIEW ONLY. Requires V2 and live-transactions.sql. Intentionally pauses old
-- financial writers; verify every permitted replacement on an isolated restore.
-- Never apply this standalone or claim UI guards establish this boundary.
begin;
revoke insert,update,delete,truncate,references,trigger on public.sales,public.sale_items,public.products,public.rep_holdings,public.product_returns,public.payments,public.supplier_orders,public.supplier_order_items,public.price_change_requests,public.inventory_receipts,public.inventory_receipt_items,public.stock_requests,public.stock_request_items,public.approval_history from public,anon,authenticated;
-- Column grants bypass a table-level revoke; clear all existing column mutations.
do $$declare t record;c record;begin
 for t in select oid,relname from pg_class where relnamespace='public'::regnamespace and relname in('sales','sale_items','products','rep_holdings','product_returns','payments','supplier_orders','supplier_order_items','price_change_requests','inventory_receipts','inventory_receipt_items','stock_requests','stock_request_items','approval_history') loop
  for c in select attname from pg_attribute where attrelid=t.oid and attnum>0 and not attisdropped loop
   execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',c.attname,c.attname,c.attname,t.relname);
  end loop;
 end loop;
end$$;
revoke execute on function public.adjust_holdings(uuid,uuid,integer,numeric,text),public.approve_return_atomic(uuid,boolean,uuid,text),public.cancel_sale(uuid),public.confirm_payment_atomic(uuid,uuid,text),public.edit_sale(uuid,text,jsonb,text),public.record_payment(numeric,text,jsonb,text),public.record_sale(text,uuid,jsonb),public.reject_payment_atomic(uuid,uuid,text),public.set_payment_status(uuid,text,text) from public,anon,authenticated;
-- RLS protects readable rows; service-role jobs remain a separate audited boundary.
-- Real inherited/custom roles and all definer dependency paths require live-JWT
-- acceptance. Do not change ownership, existing rows or grants to service_role.
commit;
