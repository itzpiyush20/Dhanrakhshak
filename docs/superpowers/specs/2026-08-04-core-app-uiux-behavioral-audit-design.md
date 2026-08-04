# Core App UI/UX & Behavioral-Science Audit — Design

## Goal

Audit the logged-in app's information architecture, navigation placement, and interaction
patterns against standard behavioral-science / UX heuristics (Fitts's Law, Hick's Law,
progressive disclosure, Nielsen's consistency heuristic, mental-model matching), benchmarked
against Indian fintech (CRED, Groww, Zerodha Kite, PhonePe, Jupiter) and global personal-finance
apps (Mint, YNAB, Monarch, Copilot). This is a findings-and-priority document, not a fix pass —
implementation happens in a separate plan per approved section.

## Relationship to prior work

[`2026-08-02-mobile-uiux-review-design.md`](2026-08-02-mobile-uiux-review-design.md) already
audited-and-fixed mobile-specific issues (touch targets, overflow, truncation, safe-area
handling) at 360-430px width, explicitly scoped out tablet/desktop (≥768px), and was merged via
the `mobile-uiux-fixes` branch. That work is about *rendering correctness at small widths*. This
audit is a different layer: *information architecture and behavioral design* — where things live,
what mental model they build, whether placement matches how successful apps train user habits —
applicable at every width. The two don't overlap in findings.

## Scope

Audited: `AppLayout.tsx` (nav shell), `DashboardPage`, `AnalyticsPage` (+ `analytics/*`),
`BudgetsPage`, `ExpensesPage`, `PendingPage`, `SubscriptionsPage`, `SettingsPage`, `ProfilePage`.

Deferred (lower complexity, mostly static content, lower behavioral payoff — separate future
pass if wanted): `LandingPage`, `PricingPage`, `SupportPage`, `AboutPage`, legal pages
(`PrivacyPage`, `TermsPage`, `RefundPage`).

Explicitly out of scope for this doc: a first-login onboarding tour. That's a distinct
deliverable, built *after* whichever findings below get fixed — teaching a layout that's about
to change would be wasted work. Tracked as follow-up, not designed here.

## Findings

Ranked by behavioral impact. Each includes the concrete failure mode, not just the heuristic
name. Numbering follows discovery order from the audit session, so it is not sequential within
tiers; F9 (no first-login orientation — the only onboarding artifact is a one-time privacy
card at `AppLayout.tsx:896-906` that explains data handling but nothing about navigation or
features) is intentionally absent from the tiers below: it is the confirmed gap that motivates
the deferred onboarding-tour spec, not a fix in this document's scope.

### Critical — breaks the daily habit loop or the user's mental model of the app

**F1. Two competing nav systems visible on mobile simultaneously, and the more prominent one
drops two of six sections.**
[`AppLayout.tsx:734-759`](../../../src/layouts/AppLayout.tsx) renders a horizontal-scroll sub-nav
(Dashboard, Expenses, Budgets, Pending, Insights, Subscriptions — 6 items) directly above
[`AppLayout.tsx:1134-1220`](../../../src/layouts/AppLayout.tsx), a fixed bottom tab bar (Home,
Expenses, +Add, Pending, Insights — 5 items, no Budgets, no Subscriptions). Both render on every
mobile viewport at once. Fitts's Law: the bottom bar is the thumb-zone, highest-frequency-access
surface — and it excludes Budgets, arguably the single most habit-forming screen in a finance
app. Two simultaneous nav systems for the same route set also breaks "one source of truth" for
wayfinding. Worse: the mobile hamburger menu (`AppLayout.tsx:762-881`) *also* lists all six
sections — so the sub-nav strip is a third, fully redundant surface for routes already reachable
from two others.
*Fix direction (recommended):* delete the sub-nav strip entirely. Bottom bar stays the canonical
mobile nav (Home, Expenses, +Add, Pending, Insights — Pending keeps its slot because approving
auto-detected transactions is the app's highest-frequency loop); Budgets and Subscriptions remain
reachable via the hamburger menu, which already lists them. If usage data later shows Budgets
deserves a thumb-zone slot, swap it in for a lower-frequency item then — don't add a third nav
surface now.

**F2. "Where do I check my budget?" has two unrelated answers.**
[`BudgetsPage.tsx`](../../../src/pages/BudgetsPage.tsx) = per-category ₹ limits with pace
projection. [`AnalyticsPage.tsx`](../../../src/pages/AnalyticsPage.tsx) (nav label "Insights") =
50/30/20 buckets, health score, burn-down. Same underlying concept — "am I spending too much" —
lives in two places under two different names, with nothing in either page's copy or nav
acknowledging the other exists.
*Fix direction (recommended):* differentiate rather than merge — merging would blow up page
scope for marginal gain. Concretely: (a) sharpen each page's subtitle to state its distinct job
("Set per-category monthly limits and get overspend warnings" vs. "Understand where your money
went and whether the split is healthy"), and (b) add a one-line cross-link card on each page
pointing at the other ("Want spending limits with alerts? → Budgets" / "Want the full picture of
this month's spending? → Insights"). Full merge stays a possible later evolution, out of scope
here.

**F3. Insights page has two live time-filters with no visible scoping.**
[`AnalyticsPage.tsx:668-677`](../../../src/pages/AnalyticsPage.tsx) — "Range" selector and
"Advisory period" date picker sit side by side in the header. Range drives trend chart, category
breakdown, merchant leaderboard, category trend. Advisory period drives 50/30/20, health score, AI
insights, budget burn-down. Nothing marks which sections respond to which control — a user
changing one and seeing unrelated numbers stay static (or the wrong numbers move) has no way to
know why.
*Fix direction:* visually scope each control to its section (e.g. move Advisory period inline
with the advanced-analysis block it actually governs, since that block is already visually
separated by the progressive-disclosure toggle), or consolidate to one control if the two ranges
can reasonably be unified.

**F4. Pending page can stack up to 6 banners above the fold with no priority.**
[`PendingPage.tsx:618-911`](../../../src/pages/PendingPage.tsx) — premium gate, error, inactivity
warning, scan-success, cooldown, and Gmail-connect-prompt banners can all be simultaneously true
and all render. A new/trial user's first visit can be a wall of banners before a single
transaction is visible.
*Fix direction:* pick the single highest-priority banner to show (suggested priority: blocking
errors > premium gate > Gmail-connect > inactivity > cooldown > success), queue the rest, or fold
lower-priority ones into the notification bell instead of page-level banners.

### High — safety/consistency risk on irreversible or security-adjacent actions

**F5. Same list, two different interaction costs for the two primary row actions.**
Approve = optimistic UI + 5s undo toast
([`PendingPage.tsx:402-431`](../../../src/pages/PendingPage.tsx) — genuinely good pattern, keep
it, it matches Gmail's undo-send model). Reject = blocking `ConfirmDialog` modal
([`PendingPage.tsx:1243-1253`](../../../src/pages/PendingPage.tsx)). One row, two buttons, two
different friction models for actions of comparable reversibility (reject just deletes a still-
pending, unapproved record).
*Fix direction:* align Reject to the same undo-toast pattern used for Approve, since the
underlying data risk is comparable and the current split is arbitrary rather than intentional.

**F10. Two password-change paths, unexplained, on two different pages.** Settings has
"Change Account Password" (direct set,
[`SettingsPage.tsx:743-787`](../../../src/pages/SettingsPage.tsx)). Profile has "Reset My
Password" (email-link flow, [`ProfilePage.tsx:257-274`](../../../src/pages/ProfilePage.tsx)).
Both are legitimate (direct-change vs. forgot-password) but neither page's copy tells the user the
other path exists or why they'd pick one over the other.
*Fix direction:* add a one-line cross-reference on each card ("Know your current password? Use
Change Password in Settings instead." / vice versa), or consolidate both under one "Account
Security" card.

**F11. Destructive actions sit directly beside a playful feature, same visual weight.**
[`ProfilePage.tsx:278-365`](../../../src/pages/ProfilePage.tsx) — right column, top to bottom:
"Populate Demo Data" (green, playful) → "Reset Account Data" (irreversible wipe) → "Delete
Account" (irreversible, permanent). Only border/background color differentiates severity; all
three are equally reachable in one scroll.
*Fix direction:* collapse the two danger-zone cards behind an explicit "Show danger zone" expand
step (GitHub/Vercel pattern) — the extra deliberate action reduces accidental-click risk more than
color alone does.

**F12. Two "reset"-shaped actions, different blast radius, inconsistent visual caution.**
Profile's "Reset Account Data" wipes all transactions/budgets/logs — styled with danger colors.
Settings' "Start New Financial Year"
([`SettingsPage.tsx:958-988`](../../../src/pages/SettingsPage.tsx)) stops the current year's
scanning and is *not* styled as caution at all, despite being a similarly state-changing,
hard-to-casually-undo action.
*Fix direction:* give the FY rollover at least a warning-tier visual treatment (matching the
amber/warning pattern already used elsewhere in the app, e.g. Budgets' near-limit warning), so
severity is legible from color alone, consistently, everywhere.

### Medium — placement/consistency issues that add friction without being unsafe

**F6. Subscriptions page: setup content outranks the actual reason to visit, on mobile.**
[`SubscriptionsPage.tsx:295-399`](../../../src/pages/SubscriptionsPage.tsx) — total-outflow
summary, optimization-suggestion card, and manual-add form (all secondary/setup content) precede
the renewal calendar (the primary content) in DOM order, so mobile users scroll past three setup
widgets before reaching upcoming renewals.
*Fix direction:* reorder so the renewal calendar renders first on narrow viewports (e.g. via
`order-*` utilities or restructuring the grid), keeping the current visual order on wider
viewports where both columns are visible side-by-side anyway.

**F8. Notification bell aggregates 4 unrelated concern types into one undifferentiated stream.**
[`AppLayout.tsx:97-219`](../../../src/layouts/AppLayout.tsx) — pending-transaction count, budget
breach, receivable due, insurance premium due, all one generic bell badge. The dropdown
([`AppLayout.tsx:538-583`](../../../src/layouts/AppLayout.tsx)) differentiates only by background
color, not by icon or grouping.
*Fix direction:* add a small type icon per notification row (matching the source page's icon —
e.g. `Wallet` for budget, `CreditCard` for receivables) so users can triage the list at a glance
without reading every line, same way the bottom-nav Pending badge already reads clearly today.

**F13. Insurance premium management filed under Settings, not with the rest of financial
obligations.** [`SettingsPage.tsx:851-956`](../../../src/pages/SettingsPage.tsx) — a recurring
bill sits inside "Configuration Settings," next to merchant rules and encrypted backups. Dashboard
already surfaces an `InsurancePremiumCard` for *viewing* premiums, so the split is: view on
Dashboard, manage in Settings, with no link between the two.
*Fix direction:* add a "Manage" link from the Dashboard's `InsurancePremiumCard` straight to the
Settings section (anchor scroll), so users don't have to already know it lives there.

**F14. Nested multi-column forms may squeeze at tablet width — needs live verification.**
[`SettingsPage.tsx:524`](../../../src/pages/SettingsPage.tsx) — the inline merchant-rule creator
uses `sm:grid-cols-4` nested inside the page's `md:col-span-7` column. At `md` width (768-1023px)
that column is roughly 450px, giving each of the 4 fields (text input, category select, type
select, checkbox+button) about 110px — tight for a `<select>` carrying emoji + label text.
*Fix direction:* verify in-browser at 768px and 1024px before deciding; if cramped, drop to
`sm:grid-cols-2` within this specific column instead of 4, since the outer 7/12 split already
reduces available width compared to a full-width context.

### Low — polish, no functional risk

**F7. Icon language is inconsistent between pages.** Nav and Pending use Lucide icons throughout;
Subscriptions and Settings headers mix in raw emoji ("📅 Subscription Renewal Calendar", "📝 Add
Manual Subscription", "🛡️ Insurance Policies"). Cosmetic, but breaks Nielsen's consistency
heuristic across a single session.
*Fix direction:* replace emoji headers with the equivalent Lucide icon already used for that
concept elsewhere in the app (e.g. `RefreshCw` for renewals, `Shield` for insurance — both already
imported and used elsewhere in the codebase).

## Cross-cutting device requirement

Every fix arising from this doc must be checked at four widths before being called done: 375px
(mobile), 768px (tablet), 1024-1280px (laptop), 1440px+ (desktop). This is a live-browser check
during implementation (`preview_start` + `resize_window` + `read_page`/screenshot), not a
Tailwind-class read-through — F14 above is a specific example of why static-class reasoning isn't
sufficient on its own.

## Recommended fix order

1. F1 (nav duplication) — highest reach, affects every mobile session.
2. F2, F3 (mental-model splits) — confusion compounds every time the user opens either page.
3. F4 (banner stacking) — first-impression risk for new/trial users specifically.
4. F5, F10, F11, F12 (safety/consistency on sensitive actions) — can ship together, all touch
   Settings/Profile/Pending in isolated, non-overlapping edits.
5. F6, F8, F13, F14 — polish/placement, no urgency, batch whenever convenient.
6. F7 — trivial, can ride along with any of the above touching the same file.

## Deferred to later specs

- Marketing/legal pages (Landing, Pricing, Support, About, legal) — not audited in this pass.
- First-login onboarding tour (finding F9) — separate spec, built after the fixes above land, so
  it teaches the final layout rather than one about to change.
