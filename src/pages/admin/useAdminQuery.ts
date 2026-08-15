// ============================================
// useAdminQuery — one RPC call, with loading and error state.
//
// Each tab calls this independently so a failure in one tab cannot blank the
// others. A non-admin caller gets a Postgres exception here, which surfaces as
// an ordinary error state rather than a crash.
//
// `loading` is DERIVED, not stored: state is written only from the async
// callback, never synchronously in the effect body. Setting it synchronously
// would trigger a cascading render on every args change (and trips the repo's
// react-hooks/set-state-in-effect rule). Instead each request has a key, and
// the query counts as loading until the settled result carries that same key —
// which also discards a stale in-flight response for free.
// ============================================

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/services/supabase'

interface AdminQueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

interface SettledResult<T> {
  key: string
  data: T | null
  error: string | null
}

export function useAdminQuery<T>(
  fn: string,
  args: Record<string, unknown> = {},
  deps: unknown[] = []
): AdminQueryState<T> {
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState<SettledResult<T>>({ key: '', data: null, error: null })

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  // One string identifying this exact request. Changing the function, the
  // arguments, the extra deps, or hitting reload produces a new key, which both
  // re-runs the effect and flips the result back to loading.
  const requestKey = `${fn}|${JSON.stringify(args)}|${nonce}|${JSON.stringify(deps)}`

  useEffect(() => {
    let cancelled = false

    // supabase.rpc is untyped for custom functions; the shapes are declared in
    // src/types/database.ts and asserted by each tab.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.rpc as any)(fn, args)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data: rows, error: rpcError }: { data: any; error: any }) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          data: rpcError ? null : (rows as T),
          error: rpcError ? rpcError.message : null,
        })
      })

    return () => {
      cancelled = true
    }
    // args and fn are captured in requestKey; re-running on the key alone keeps
    // the effect from firing on every render for a freshly-built args object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const settled = result.key === requestKey

  return {
    data: settled ? result.data : null,
    loading: !settled,
    error: settled ? result.error : null,
    reload,
  }
}
