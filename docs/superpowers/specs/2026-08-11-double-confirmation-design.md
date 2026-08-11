# Duplicate transaction confirmation — design

## Problem

Two symptoms reported: transactions already approved keep reappearing in the
Auto-Categorization Review popup, and the same transaction has to be confirmed
twice — once in that popup, then again in the main Pending Review list.

Both trace to two defects around `transactions.category_confirmed_at`.

Migration 007 (`supabase/007_category_confirmation.sql`) defines the field's
contract:

> NULL means "the system auto-categorized and **auto-approved** this without
> human review, and the user hasn't confirmed the category yet." Every other
> transaction (manual entries, anything the user explicitly approved via
> Pending Alerts) has a timestamp here.

The code violates that contract in two places.

**Defect A — the popup query has no `approval_status` filter.**
`fetchUnconfirmedCategorizations` (`PendingPage.tsx:241-247`) selects every row
with `category_confirmed_at IS NULL` in the current month, regardless of
approval status. Per the contract above the popup exists only for *auto-approved*
rows — those the user never got to review. A row with
`approval_status: 'pending'` and a NULL timestamp therefore appears in **both**
the popup and the main Pending Review list, and needs an action in each. That is
the "confirm twice" symptom.

**Defect B — approving never writes the timestamp.**
`commitApproval` (`PendingPage.tsx:407-411`) updates `category`, `description`,
and `approval_status` — but not `category_confirmed_at`. The contract says a row
approved via Pending Alerts should carry a timestamp; it never gets one. Any row
sitting at NULL stays NULL permanently, so the popup keeps asking about it even
after approval. That is the "already considered, asked again" symptom, and it
also explains rows that appeared to be both approved and still-unconfirmed:
approval simply never cleared the flag.

Bulk approve routes through the same `commitApproval` (`PendingPage.tsx:490`),
so both defects have a single fix point each.

## Design

**A. Filter the popup query to auto-approved rows.** Add
`.eq('approval_status', 'approved')` to the query in
`fetchUnconfirmedCategorizations`. Pending rows stop appearing in the popup;
they remain fully reviewable in the main Pending Review list, which already has
its own per-row category dropdown, so no capability is lost.

**B. Write the timestamp on approval.** Add
`category_confirmed_at: new Date().toISOString()` to the `updateTransaction`
call in `commitApproval`, alongside the existing fields. This makes the code
honour migration 007's contract and covers single and bulk approve at once.

Net behaviour: a scanned transaction lands `pending` → appears in the main
Pending list only → the user approves it once → it is timestamped → it never
surfaces in the popup. Genuinely auto-approved rows (should that path ever
produce them again) still appear in the popup exactly once, and confirming them
writes the timestamp as it does today.

Pre-existing rows that are already `approved` with a NULL timestamp will surface
in the popup once, be confirmed, and stay gone — no migration or backfill is
needed or included, matching migration 007's deliberate choice not to ship a
mass-confirm backfill.

## Non-goals

- **Persisting "Review Later" as a snooze.** Considered and dropped as YAGNI:
  once A and B land, the popup only contains rows that genuinely need a
  one-time confirmation and that every resolution path now clears, so the
  repeat-nagging this would have masked no longer occurs.
- **Backfilling existing NULL rows.** Migration 007 explicitly avoided a bulk
  confirm because it would silently mass-confirm transactions genuinely
  awaiting review. That reasoning still holds.

## Testing

No unit test is added. Both changes are inside React component callbacks in a
page component, and this codebase does not unit-test page components — there is
no test file for `PendingPage.tsx`, `ExpenseForm.tsx`, or `ExpenseList.tsx`, and
no page-level test harness to extend. Verification is the existing full test
suite (guarding against regressions elsewhere), `tsc -b`, lint, and a manual
browser check: approve a pending transaction, reload the page, and confirm it
does not reappear in the popup.
