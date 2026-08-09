# Editable merchant field — design

## Problem

`ExpenseForm.tsx` has no `Merchant` input at all — neither when adding a transaction manually nor when editing an existing one. `transactions.merchant` is a real, nullable `TEXT` column already used throughout the app's display layer (Top Merchants, drill-down modal, dashboard, expense list, pending review — see the merchant/remark display cleanup work), but users have no way to set or correct it themselves.

## Scope

Add a `Merchant` field to `ExpenseForm.tsx`, wired into both the create and update paths. No database changes — the column already exists.

## Design

### Field placement

Current form layout:
```
Row 1: Type | Amount
Row 2: Category | Date
Row 3: Description (full width)
Row 4: Tags (full width)
```

New layout:
```
Row 1: Type | Amount
Row 2: Merchant | Category
Row 3: Description | Date
Row 4: Tags (full width)
```

Same total row count as today. Merchant sits early, paired with Category, reflecting that it's now a primary identity field for the transaction.

### Input behavior

Plain `Input` component with a native HTML `<datalist>` attached via the standard `list` attribute. `Input` (`src/components/ui/Input.tsx`) already extends `InputHTMLAttributes<HTMLInputElement>` and spreads `...props` onto the underlying `<input>`, so `list="merchant-suggestions"` passes through with zero changes to `Input.tsx`.

The datalist's `<option>`s come from a new exported constant in `src/services/merchantNormalizer.ts`:

```typescript
export const KNOWN_MERCHANTS: string[] = CANONICAL_MAP.map((entry) => entry.canonical)
```

This is browser-native autocomplete — suggests known brands (Swiggy, Amazon, Zomato, Netflix, etc.) as the user types, but never restricts input; any free-text value is still accepted and saved as-is.

### Required / optional

Optional, matching the form's existing pattern for non-essential fields (same treatment as `notes`). `merchant: merchant.trim() || null` is sent on save. This also matches how `resolveTransactionIdentity` already handles a blank merchant (falls back to a recovered brand from narration, or `'Unclassified'`) — nothing downstream breaks if the field is left empty.

### State & wiring

- `const [merchant, setMerchant] = useState(editingTransaction?.merchant || '')`
- Added to the `createTransaction` payload and the `updateTransaction` payload, both as `merchant: merchant.trim() || null`
- Reset to `''` in the post-submit form-reset block (the `if (!isEditing) { ... }` branch), alongside the other fields that reset there

### Testing

No existing test file for `ExpenseForm.tsx`, and this codebase doesn't unit-test presentational form components (`Input.tsx`, `Select.tsx` have none either). Verification is a manual browser check: add a transaction with a merchant, confirm it saves and displays correctly (via the existing `TransactionIdentity` display work); edit an existing transaction's merchant, confirm the change persists; leave merchant blank, confirm the transaction still saves.
