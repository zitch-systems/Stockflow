# StockFlow V2 change register

Changes below are staged in the review branch. Retained advanced workflows and production release gates are described in the issue register.

| Existing | Problem | V2 solution | Benefit |
| --- | --- | --- | --- |
| Separate sale header/lines/stock writes | Partial transactions and lost deductions | Atomic server sale, authoritative totals/cost snapshots, request keys and ordered locks | Coherent sale, stock, receipt and reporting |
| Shortage-clamped dispatch | Can allocate unavailable inventory | Requested-quantity validation, stored request prices, stock locks and replay check | Conserves warehouse/rep quantity and dispatch debt |
| Invoice check followed by insert | Concurrent duplicate delivery | Normalized tenant/invoice unique identity, lock and replay payload | Delivery changes stock once |
| Client absolute stock corrections | Overwrite concurrent activity; OR modal uses another target variable | One shared modal target and expected-count relative adjustment with reason | Reliable, auditable correction |
| Mutable stock without authoritative journal | Difficult reconciliation | Labelled V2 opening balance plus immutable client movement/audit records | Detectable discrepancies and traceable changes |
| Metadata form writes stock | Name/price edit loses sale deduction | Quantity excluded from metadata; stock change is separate | Preserves inventory integrity |
| Missing/throwing RPC fallback | Uncertain action becomes another set of writes | Identified checkout/edit/cancel/receive/payment paths stop and explain uncertainty | Prevents unsafe secondary mutations |
| Client-capped/status-inconsistent overview | Misleading totals and profits | Server aggregation, Lagos days, zero-sales dates, cost completeness and pending separation | Accurate new workspace insights |
| Profile repair from editable metadata | Browser can become an identity authority | Authoritative profile only; distinct missing/network outcomes | Fails closed without trusting user-assigned roles |
| Signup trigger accepts existing tenant/staff role | Public signup can attach an account to another business | New-business-only owner signup; owner-authorised service invitation and immutable approved payload | Removes editable metadata as tenant/role authority |
| Staff form creates/shared temporary passwords | Browser provisions identities; response loss/session replacement | Verified owner invitation, same-key recovery, no existing-account rebind | Safer staff setup and recovery |
| Quoted CSV text | Spreadsheet formulas can still execute | CSV parsing/neutralisation at eight export sites | Safer reports while preserving numeric values and quoting |
| Phone login/home handoff only | Core operations leave app | Dedicated shared mobile/desktop workspace, scanner integration and native lifecycle lock | Practical phone POS and business management |
| Persisted native localStorage tokens | Lost process/device retains credentials | Memory-only native sessions, tab-scoped browser sessions, password unlock and profile recheck | Reduced persistent-session exposure |
| Offline shell without write-sync semantics | False expectations of offline transactions | Explicit offline finalisation block and retained checkout retry intent | Recoverable uncertainty without duplicate sync |
| Generic simulated marketing UI | Visitors cannot assess actual product | Five real screenshots, labelled example data, distributor copy and responsive frames | Credible product presentation |
| External build font fetches | Network-dependent reproducibility | Bundled font packages and self-hosted marketing files | Reliable export and consistent typography |
| Native/web export output confusion | Prefixed links point to wrong routes | Separate outputs and deploy bundle routing tests | Correct `/workspace` paths and native packaging |
| Parse-only QA | Integrity and failures invisible | 33 DB, 7 invitation-handler, 32 retained-action/CSV, 14 unit and 16 browser flows plus website checks; race/native CI | Reviewable evidence and explicit remaining gaps |
| Informal deploy process | Unsafe data rollout and recovery assumptions | Preflight, restored-data migration gates, rollback/recovery runbook and launch checklist | Controlled release with preserved data |
