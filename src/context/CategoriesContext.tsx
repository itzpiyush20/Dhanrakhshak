// ============================================
// CategoriesContext — the user's dynamic category list.
// Replaces the old static CATEGORIES constant everywhere.
// ============================================

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { getCategories } from '@/services/categories'
import { useAuth } from '@/context/AuthContext'
import { CATEGORY_STYLE_FALLBACK } from '@/constants'
import type { Category } from '@/types'

interface CategoriesContextValue {
  categories: Category[]
  loading: boolean
  /** name → category row; missing names fall back to a neutral style */
  categoryMap: Record<string, Category>
  /** The is_permanent row ("Other" unless renamed) — delete fallback target */
  fallbackCategory: Category | null
  /** Style lookup that never throws: unknown names get the neutral style */
  getStyle: (name: string) => { emoji: string; color: string; label: string }
  refresh: () => Promise<void>
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null)

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setCategories([]); setLoading(false); return }
    const { data } = await getCategories()
    setCategories(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c])),
    [categories]
  )

  const fallbackCategory = useMemo(
    () => categories.find((c) => c.is_permanent) ?? null,
    [categories]
  )

  const getStyle = useCallback(
    (name: string) => {
      const c = categoryMap[name]
      return c
        ? { emoji: c.emoji, color: c.color, label: c.name }
        : { ...CATEGORY_STYLE_FALLBACK, label: name }
    },
    [categoryMap]
  )

  return (
    <CategoriesContext.Provider value={{ categories, loading, categoryMap, fallbackCategory, getStyle, refresh }}>
      {children}
    </CategoriesContext.Provider>
  )
}

export function useCategories() {
  const ctx = useContext(CategoriesContext)
  if (!ctx) throw new Error('useCategories must be used within CategoriesProvider')
  return ctx
}
