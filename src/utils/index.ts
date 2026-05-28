// ============================================
// Currency & Date Formatting Utilities
// Designed for Indian locale (INR, dd/mm/yyyy)
// ============================================

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const INR_COMPACT_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

/** Format amount as ₹1,23,456.78 */
export function formatCurrency(amount: number): string {
  return INR_FORMATTER.format(amount)
}

/** Format large amounts as ₹1.2L, ₹3.5Cr */
export function formatCurrencyCompact(amount: number): string {
  return INR_COMPACT_FORMATTER.format(amount)
}

/** Format date as "28 May 2026" */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format date as "28 May" (no year — for current month views) */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

/** Format time as "11:30 PM" */
export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Get current month as YYYY-MM */
export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Merge classnames, filtering falsy values */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
