// ============================================
// URLAuthTrigger — Automatically trigger AuthModal based on URL query params
// ============================================

import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function URLAuthTrigger() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { openAuthModal, user } = useAuth()

  useEffect(() => {
    const authType = searchParams.get('auth')
    const redirect = searchParams.get('redirect')

    if (authType === 'login' || authType === 'signup') {
      if (!user) {
        openAuthModal(redirect || undefined, authType)
      }
      
      // Clean parameters from URL to keep the address bar clean
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('auth')
      newParams.delete('redirect')
      setSearchParams(newParams, { replace: true })
    }
  }, [searchParams, setSearchParams, openAuthModal, user])

  return null
}
