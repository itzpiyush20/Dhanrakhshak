// ============================================
// useAdminQuery — one RPC call, with loading and error state.
//
// Each tab calls this independently so a failure in one tab cannot blank the
// others. A non-admin caller gets a Postgres exception here, which surfaces as
// an ordinary error state rather than a crash.
// ============================================

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/services/supabase'

interface AdminQueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAdminQuery<T>(
  fn: string,
  args: Record<string, unknown> = {},
  deps: unknown[] = []
): AdminQueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const argsKey = JSON.stringify(args)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.rpc as any)(fn, args)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data: rows, error: rpcError }: { data: any; error: any }) => {
        if (cancelled) return
        if (rpcError) setError(rpcError.message)
        else setData(rows as T)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, argsKey, nonce, ...deps])

  return { data, loading, error, reload }
}
