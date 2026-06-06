-- Production 400s observed in postgres logs (audit on 2026-06-05):
--   1) "column sales.notes does not exist"
--      owner-dashboard.html:4461 (loadSlSellHist) selects ...,payment_method,notes.
--      The solo-owner sell-insert also writes notes:note||null, so a real
--      column was always intended.
--   2) "column customers.is_active does not exist"
--      rep-dashboard.html:3074 (loadRepCustomers) filters .eq('is_active', true).
--      Without the column the query 400s and the rep customer typeahead
--      silently returns no suggestions.
--
-- Adds both columns. customers.is_active defaults to true so every existing
-- row remains visible to the rep typeahead immediately after migration.

ALTER TABLE public.sales      ADD COLUMN IF NOT EXISTS notes     text;
ALTER TABLE public.customers  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
