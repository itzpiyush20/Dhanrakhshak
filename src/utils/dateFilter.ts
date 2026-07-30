// ============================================
// DateFilter — shared Month/Custom range type
// used by DateFilterPicker and the data layer
// ============================================

export type DateFilter =
  | { mode: 'month'; month: string }               // month: YYYY-MM
  | { mode: 'custom'; from: string; to: string }   // from/to: YYYY-MM-DD

/** Formats a Date as YYYY-MM-DD using local date parts — avoids the UTC-conversion
 * rollover that `toISOString()` introduces in timezones ahead of UTC. */
export function toISODateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Resolves either filter mode to a concrete inclusive date range. */
export function resolveDateFilter(filter: DateFilter): { dateFrom: string; dateTo: string } {
  if (filter.mode === 'custom') {
    return { dateFrom: filter.from, dateTo: filter.to }
  }
  const [year, mon] = filter.month.split('-').map(Number)
  const dateFrom = `${filter.month}-01`
  // Day 0 of the *next* month is the last day of this one — and passing
  // month index `mon` (1-indexed) as Date's 0-indexed month argument
  // already means "next month", so this rolls across year boundaries
  // (e.g. December -> January) correctly with no special-casing.
  const dateTo = toISODateLocal(new Date(year, mon, 0))
  return { dateFrom, dateTo }
}

/** Every YYYY-MM month touched by [dateFrom, dateTo], inclusive, in chronological order. */
export function getMonthsInRange(dateFrom: string, dateTo: string): string[] {
  const [fromYear, fromMon] = dateFrom.split('-').map(Number)
  const [toYear, toMon] = dateTo.split('-').map(Number)

  const months: string[] = []
  let year = fromYear
  let mon = fromMon
  while (year < toYear || (year === toYear && mon <= toMon)) {
    months.push(`${year}-${String(mon).padStart(2, '0')}`)
    mon++
    if (mon > 12) {
      mon = 1
      year++
    }
  }
  return months
}

/** Human-readable label for a filter — "July 2026" or "1 Jul 2026 – 20 Jul 2026". */
export function formatDateFilterLabel(filter: DateFilter): string {
  if (filter.mode === 'month') {
    const [year, mon] = filter.month.split('-').map(Number)
    return new Date(year, mon - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  }
  const formatOne = (d: string) => {
    const [year, mon, day] = d.split('-').map(Number)
    return new Date(year, mon - 1, day).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
  return `${formatOne(filter.from)} – ${formatOne(filter.to)}`
}
