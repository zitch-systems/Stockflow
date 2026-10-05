# StockFlow V2 design system

The new website and business workspace share a restrained jade/forest palette, S mark, self-hosted Sora headings and DM Sans body text. Existing operational dashboards remain during staged migration; they are not represented as fully redesigned.

| Token/pattern | Implementation |
| --- | --- |
| Primary jade | Website/native mark `#127d5c`; workspace jade `#167c5c`, darker active shade `#126347` |
| Forest | Workspace `#132f38` for key business metrics |
| Canvas | Light workspace `#f5f7f7`; white surfaces; existing light/dark theme support |
| Text | Primary `#162c32`, supporting `#637376`; explicit contrast for disabled controls |
| Borders | `#e4eae7`; avoid heavy shadows in operational tables |
| Typography | Sora 600 headings; DM Sans 400/600 body; readable 14px operational text, responsive headings |
| Spacing | 4/8px rhythm; 16px phone gutters; 24–42px desktop content gutters |
| Controls | At least 44px main touch targets; 9px button radius; clear primary/ghost/danger roles |
| Cards | 12–14px radius; restrained borders and depth; financial values have clear units/status |
| Navigation | Desktop sidebar; six phone destinations; visible business and warehouse/allocated-stock context |
| Dialogs | Native HTML dialog, accessible title, close/Escape, busy-state protection; replace one workflow at a time |
| States | Actionable empty states, loading status, friendly error feedback, retry and explicit offline status |
| Motion | Reduced-motion support; no animation required to understand stock or payment state |
| Product visuals | Actual interface screenshots, consistent browser/phone frames, clearly labelled example data |

Reusable operational components are in `mobile/src/components/ui.tsx`: Button, Icon, Dialog, Empty, Loading and Pagination. Shared operational forms, search, badges, cards and receipt layouts live in `Workspace.tsx`/`workspace.css`. Inputs use real labels and autocomplete where relevant. The current date control uses Today/7 days/30 days; a full calendar date picker is not claimed. Drawer, toast queue and advanced table abstractions should be extracted when additional workflows actually require them.

Creation asks for name, cost/selling prices and optional opening stock. SKU and reasons are progressively disclosed. Editing metadata cannot change quantity; stock correction is a separate reasoned operation. Phone POS uses two product columns, a thumb-accessible cart action and contextual checkout. Customer purchase history filters by ID instead of guessing from a name.

The native asset generator renders the committed vector mark into Android adaptive icons, iOS AppIcon and splash resources. It does not use synthetic product screenshots. `mobile/resources/icon.png` is the retained original brand asset; `v2-icon.svg`/`v2-icon.png` are the new mark.

Remaining UX work: migrate advanced role pages; usability sessions with first-time owners, managers and reps; real keyboard/screen-reader audits across the full legacy product; native camera permission/device-loss exercises; onboarding email/deep-link QA. Four website widths and a 390px phone workspace were checked locally; that is not a substitute for physical devices.
