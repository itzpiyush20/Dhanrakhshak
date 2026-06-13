// ============================================
// AuthContext — Global auth state management
// Handles session tracking, login, signup,
// logout, password reset, and Google OAuth
// ============================================

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { saveGoogleToken, clearGoogleToken, clearAllGoogleTokens, isGoogleConnected, purgeOldTokenKey, validateGoogleToken, saveGoogleRefreshToken, tryRefreshGoogleToken } from '@/services/googleAuth'
import { Button } from '@/components/ui'
import { identifyUser, resetAnalytics, track, EVENTS } from '@/services/analytics'
import { getGlobalCurrency, getGlobalCurrencySymbol, setGlobalCurrency } from '@/utils'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  profile: any
  hasGoogleToken: boolean
  refreshProfile: () => Promise<void>
  notifyGoogleTokenCleared: () => void
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: (redirectPath?: string, requestGmailScope?: boolean, forceConsent?: boolean) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  isSubscriptionActive: boolean
  daysLeft: number
  updateSubscriptionStatus: (status: 'active' | 'trial', planType?: 'monthly' | 'annual' | 'lifetime', promoCode?: string) => Promise<boolean>
  authModalOpen: boolean
  authModalRedirect: string | null
  authModalTab: 'login' | 'signup'
  openAuthModal: (redirectPath?: string, tab?: 'login' | 'signup') => void
  closeAuthModal: () => void
  currency: 'INR' | 'USD'
  setCurrency: (currency: 'INR' | 'USD') => void
  currencySymbol: string
  activeYear: number
  startNewFinancialYear: (year?: number) => void
  dailyScanTime: string
  updateDailyScanTime: (time: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface DeviceSession {
  id: string
  name: string
  lastActive: number
}

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem('dhanrakshak_device_id')
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('dhanrakshak_device_id', id)
    }
    return id
  } catch (e) {
    return 'temp-device-' + Math.random().toString(36).substring(2)
  }
}

function getDeviceName(): string {
  const ua = navigator.userAgent
  let browser = 'Unknown Browser'
  let os = 'Unknown OS'

  if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) browser = 'Chrome'
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari'
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox'
  else if (/edge|edg/i.test(ua)) browser = 'Edge'
  else if (/opr/i.test(ua)) browser = 'Opera'

  if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/linux/i.test(ua)) os = 'Linux'

  return `${browser} on ${os}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  })

  const [deviceCheckRequired, setDeviceCheckRequired] = useState(false)
  const [activeSessions, setActiveSessions] = useState<DeviceSession[]>([])
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [sessionModalError, setSessionModalError] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)

  const [currency, setCurrencyState] = useState<'INR' | 'USD'>(() => getGlobalCurrency())
  const [currencySymbol, setCurrencySymbol] = useState<string>(() => getGlobalCurrencySymbol())

  const setCurrency = useCallback((newCurrency: 'INR' | 'USD') => {
    setGlobalCurrency(newCurrency)
    setCurrencyState(newCurrency)
    setCurrencySymbol(newCurrency === 'INR' ? '₹' : '$')
    if (state.user) {
      supabase
        .from('profiles')
        .update({ currency: newCurrency })
        .eq('id', state.user.id)
        .then(({ error }) => {
          if (error) {
            console.warn('Failed to sync currency to Supabase profiles (non-critical):', error.message)
          }
        })
    }
  }, [state.user])

  const [activeYear, setActiveYearState] = useState<number>(2026)

  useEffect(() => {
    if (state.user) {
      try {
        const stored = localStorage.getItem(`dhanrakshak_active_financial_year_${state.user.id}`)
        setActiveYearState(stored ? parseInt(stored, 10) : 2026)
      } catch {
        setActiveYearState(2026)
      }
    }
  }, [state.user])

  const [dailyScanTime, setDailyScanTimeState] = useState<string>('06:00')

  useEffect(() => {
    if (state.user) {
      try {
        const stored = localStorage.getItem(`dhanrakshak_daily_scan_time_${state.user.id}`)
        setDailyScanTimeState(stored || '06:00')
      } catch {
        setDailyScanTimeState('06:00')
      }
    }
  }, [state.user])

  const startNewFinancialYear = useCallback((targetYear?: number) => {
    if (!state.user) return
    const nextYear = targetYear || (activeYear + 1)
    try {
      localStorage.setItem(`dhanrakshak_active_financial_year_${state.user.id}`, String(nextYear))
      setActiveYearState(nextYear)

      supabase
        .from('profiles')
        .update({ active_financial_year: nextYear })
        .eq('id', state.user.id)
        .then(({ error }) => {
          if (error) {
            console.warn('Failed to sync active year to Supabase profiles (non-critical):', error.message)
          }
        })
    } catch (e) {
      console.error('Failed to save active year:', e)
    }
  }, [state.user, activeYear])

  const updateDailyScanTime = useCallback(async (time: string) => {
    if (!state.user) return false
    try {
      setDailyScanTimeState(time)
      localStorage.setItem(`dhanrakshak_daily_scan_time_${state.user.id}`, time)

      const { error } = await supabase
        .from('profiles')
        .update({ daily_scan_time: time })
        .eq('id', state.user.id)

      if (error) {
        console.warn('Failed to sync daily scan time to Supabase profiles (non-critical):', error.message)
      }
      return true
    } catch (e) {
      console.error('Failed to save daily scan time:', e)
      return false
    }
  }, [state.user])

  // hasGoogleToken is a proper useState — not a computed value from localStorage.
  // It is SET explicitly when a token arrives (onAuthStateChange) or is cleared
  // (sign-out, expiry detection). This guarantees React re-renders whenever the
  // connection status changes, including after the user clears an expired token.
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(() => isGoogleConnected())

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalRedirect, setAuthModalRedirect] = useState<string | null>(null)
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login')

  const openAuthModal = useCallback((redirectPath?: string, tab?: 'login' | 'signup') => {
    setAuthModalRedirect(redirectPath || null)
    setAuthModalTab(tab || 'login')
    setAuthModalOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false)
    setAuthModalRedirect(null)
  }, [])

  // Call this from anywhere to reactively update the "disconnected" UI
  // when a token is cleared due to expiry or error.
  const notifyGoogleTokenCleared = useCallback(() => {
    clearGoogleToken()
    setHasGoogleToken(false)
  }, [])

  const refreshProfile = async () => {
    if (!state.user) {
      setProfile(null)
      return
    }

    // 1. Immediately load cached settings and subscription from localStorage to prevent flashes
    try {
      const cachedStatus = localStorage.getItem(`dhanrakshak_sub_status_${state.user.id}`)
      const cachedExpires = localStorage.getItem(`dhanrakshak_sub_expires_${state.user.id}`)
      const cachedPlan = localStorage.getItem(`dhanrakshak_sub_plan_${state.user.id}`)
      const cachedScanTime = localStorage.getItem(`dhanrakshak_daily_scan_time_${state.user.id}`) || '06:00'

      if (cachedStatus) {
        setProfile({
          id: state.user.id,
          email: state.user.email,
          subscription_status: cachedStatus,
          subscription_expires_at: cachedExpires || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          subscription_plan_type: cachedPlan || 'trial',
          daily_scan_time: cachedScanTime
        })
      }

      if (cachedScanTime) {
        setDailyScanTimeState(cachedScanTime)
      }

      const cachedCurrency = localStorage.getItem('dhanrakshak_currency_preference') as 'INR' | 'USD' | null
      if (cachedCurrency) {
        setGlobalCurrency(cachedCurrency)
        setCurrencyState(cachedCurrency)
        setCurrencySymbol(cachedCurrency === 'INR' ? '₹' : '$')
      }

      const cachedYear = localStorage.getItem(`dhanrakshak_active_financial_year_${state.user.id}`)
      if (cachedYear) {
        setActiveYearState(parseInt(cachedYear, 10))
      }
    } catch (e) {
      console.warn('Failed to load cached profile:', e)
    }

    // 2. Fetch fresh data from Supabase
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', state.user.id)
        .single()
      
      const localStatus = localStorage.getItem(`dhanrakshak_sub_status_${state.user.id}`)
      const localExpires = localStorage.getItem(`dhanrakshak_sub_expires_${state.user.id}`)
      const localPlan = localStorage.getItem(`dhanrakshak_sub_plan_${state.user.id}`)

      if (!error && data) {
        const createdAtTime = data.created_at ? new Date(data.created_at).getTime() : Date.now()
        const safeCreatedAtTime = isNaN(createdAtTime) ? Date.now() : createdAtTime
        
        // Prioritize database subscription status as the single source of truth
        const isSubscribed = data.subscription_status === 'active'
        const subStatus = data.subscription_status || 'trial'
        const subExpires = data.subscription_expires_at || new Date(safeCreatedAtTime + 14 * 24 * 60 * 60 * 1000).toISOString()
        const subPlan = data.subscription_plan_type || (isSubscribed ? 'monthly' : 'trial')

        // Cache subscription details back to localStorage
        localStorage.setItem(`dhanrakshak_sub_status_${state.user.id}`, subStatus)
        if (subExpires) localStorage.setItem(`dhanrakshak_sub_expires_${state.user.id}`, subExpires)
        localStorage.setItem(`dhanrakshak_sub_plan_${state.user.id}`, subPlan)

        setProfile({
          ...data,
          subscription_status: subStatus,
          subscription_expires_at: subExpires,
          subscription_plan_type: subPlan
        })

        // Sync settings (currency and active_financial_year)
        // Check database value first. If present, sync to local. If absent/null, sync local to DB.
        
        // Currency Sync
        let currentCurrency: 'INR' | 'USD' = 'INR'
        const localCurrencyPref = localStorage.getItem('dhanrakshak_currency_preference') as 'INR' | 'USD' | null
        if (data.currency) {
          currentCurrency = data.currency as 'INR' | 'USD'
          setGlobalCurrency(currentCurrency)
          setCurrencyState(currentCurrency)
          setCurrencySymbol(currentCurrency === 'INR' ? '₹' : '$')
        } else if (localCurrencyPref) {
          currentCurrency = localCurrencyPref
          // Sync local preference to Supabase since it's null in DB
          supabase
            .from('profiles')
            .update({ currency: localCurrencyPref })
            .eq('id', state.user.id)
            .then(({ error: syncError }) => {
              if (syncError) console.warn('Non-critical: Failed to sync local currency preference to DB:', syncError.message)
            })
        }

        // Active Year Sync
        let currentYear = 2026
        const localYearPref = localStorage.getItem(`dhanrakshak_active_financial_year_${state.user.id}`)
        if (data.active_financial_year) {
          currentYear = data.active_financial_year
          setActiveYearState(currentYear)
          localStorage.setItem(`dhanrakshak_active_financial_year_${state.user.id}`, String(currentYear))
        } else if (localYearPref) {
          currentYear = parseInt(localYearPref, 10)
          // Sync local preference to Supabase since it's null in DB
          supabase
            .from('profiles')
            .update({ active_financial_year: currentYear })
            .eq('id', state.user.id)
            .then(({ error: syncError }) => {
              if (syncError) console.warn('Non-critical: Failed to sync local active year preference to DB:', syncError.message)
            })
        }

        // Daily Scan Time Sync
        let currentScanTime = '06:00'
        const localScanTimePref = localStorage.getItem(`dhanrakshak_daily_scan_time_${state.user.id}`)
        if (data.daily_scan_time) {
          currentScanTime = data.daily_scan_time
          setDailyScanTimeState(currentScanTime)
          localStorage.setItem(`dhanrakshak_daily_scan_time_${state.user.id}`, currentScanTime)
        } else if (localScanTimePref) {
          currentScanTime = localScanTimePref
          setDailyScanTimeState(currentScanTime)
          // Sync local preference to Supabase since it's null in DB
          supabase
            .from('profiles')
            .update({ daily_scan_time: localScanTimePref })
            .eq('id', state.user.id)
            .then(({ error: syncError }) => {
              if (syncError) console.warn('Non-critical: Failed to sync local scan time preference to DB:', syncError.message)
            })
        }
      } else {
        let subPlan = 'trial'
        if (localStatus === 'active') {
          subPlan = localPlan || ''
          if (!subPlan && localExpires) {
            const expiresTime = new Date(localExpires).getTime()
            const diffDays = Math.ceil((expiresTime - Date.now()) / (1000 * 60 * 60 * 24))
            subPlan = diffDays > 35 ? 'annual' : 'monthly'
          }
        }
        setProfile({
          id: state.user.id,
          email: state.user.email,
          subscription_status: localStatus || 'trial',
          subscription_expires_at: localExpires || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          subscription_plan_type: subPlan,
          daily_scan_time: localStorage.getItem(`dhanrakshak_daily_scan_time_${state.user.id}`) || '06:00'
        })
      }
    } catch (e) {
      console.error('Error fetching profile in AuthContext:', e)
      // Fallback profile to prevent app from hanging
      const localStatus = localStorage.getItem(`dhanrakshak_sub_status_${state.user.id}`)
      const localExpires = localStorage.getItem(`dhanrakshak_sub_expires_${state.user.id}`)
      const localPlan = localStorage.getItem(`dhanrakshak_sub_plan_${state.user.id}`)
      let subPlan = 'trial'
      if (localStatus === 'active') {
        subPlan = localPlan || ''
        if (!subPlan && localExpires) {
          const expiresTime = new Date(localExpires).getTime()
          const diffDays = Math.ceil((expiresTime - Date.now()) / (1000 * 60 * 60 * 24))
          subPlan = diffDays > 35 ? 'annual' : 'monthly'
        }
      }
      setProfile({
        id: state.user.id,
        email: state.user.email,
        subscription_status: localStatus || 'trial',
        subscription_expires_at: localExpires || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_plan_type: subPlan,
        daily_scan_time: localStorage.getItem(`dhanrakshak_daily_scan_time_${state.user.id}`) || '06:00'
      })
    }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    track(EVENTS.SIGNUP_STARTED, { method: 'email' })
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    if (!error) track(EVENTS.SIGNUP_COMPLETED, { method: 'email' })
    return { error: error?.message ?? null }
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.user) track(EVENTS.LOGIN_COMPLETED, { method: 'email' })
    return { error: error?.message ?? null }
  }

  const signInWithGoogle = async (redirectPath = '/dashboard', requestGmailScope = false, forceConsent = false) => {
    track(EVENTS.GOOGLE_OAUTH_STARTED)
    
    const oAuthOptions: any = {
      redirectTo: `${window.location.origin}${redirectPath}`,
    }

    if (requestGmailScope) {
      oAuthOptions.scopes = 'https://www.googleapis.com/auth/gmail.readonly'
      oAuthOptions.queryParams = {
        access_type: 'offline',
        prompt: forceConsent ? 'consent' : 'select_account',
      }
      localStorage.setItem('dhanrakshak_requesting_gmail_scope', 'true')
    } else {
      oAuthOptions.queryParams = {
        prompt: 'select_account',
      }
      localStorage.removeItem('dhanrakshak_requesting_gmail_scope')
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: oAuthOptions,
    })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    resetAnalytics()
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Error during supabase signOut:', err)
    } finally {
      setState({ user: null, session: null, loading: false })
      setHasGoogleToken(false)
      clearAllGoogleTokens()
      // Clear all Supabase session keys from localStorage
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') || key.includes('supabase') || key.includes('oauth')) {
          localStorage.removeItem(key)
        }
      }
      window.location.href = '/'
    }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error: error?.message ?? null }
  }

  useEffect(() => {
    refreshProfile()
  }, [state.user])

  useEffect(() => {
    // Purge the old token key from previous app versions (no expiry tracking).
    // This runs once on mount and is a no-op if the key doesn't exist.
    purgeOldTokenKey()

    // Get initial session — with 10s timeout to prevent app hanging on stale auth
    const sessionPromise = supabase.auth.getSession()
    const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), 10000)
    )

    Promise.race([sessionPromise, timeoutPromise]).then(async ({ data: { session } }) => {
      // Always persist the refresh token whenever Supabase gives us one
      if (session?.provider_refresh_token) {
        saveGoogleRefreshToken(session.provider_refresh_token)
      }

      if (session?.provider_token) {
        const isGmailFlow = localStorage.getItem('dhanrakshak_requesting_gmail_scope') === 'true'
        if (isGmailFlow) {
          saveGoogleToken(session.provider_token)
          setHasGoogleToken(true)
          localStorage.removeItem('dhanrakshak_requesting_gmail_scope')
        } else {
          const isValid = await validateGoogleToken(session.provider_token)
          if (isValid) {
            saveGoogleToken(session.provider_token)
            setHasGoogleToken(true)
          } else {
            // Access token from Supabase session is expired — try silent refresh
            const newToken = session.access_token
              ? await tryRefreshGoogleToken(session.access_token)
              : null
            setHasGoogleToken(!!newToken || isGoogleConnected())
          }
        }
      } else if (!isGoogleConnected() && session?.access_token) {
        // No access token in session at all — try silent refresh with stored refresh token
        const newToken = await tryRefreshGoogleToken(session.access_token)
        setHasGoogleToken(!!newToken)
      } else {
        setHasGoogleToken(isGoogleConnected())
      }
      setState({
        user: session?.user ?? null,
        session: session ?? null,
        loading: false,
      })
    }).catch(() => {
      setState({ user: null, session: null, loading: false })
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setAuthModalOpen(false)
          if (window.location.pathname !== '/reset-password') {
            navigate('/reset-password')
          }
        }

        // Always persist the refresh token whenever Supabase gives us one
        if (session?.provider_refresh_token) {
          saveGoogleRefreshToken(session.provider_refresh_token)
        }

        if (session?.provider_token) {
          // Fresh token from OAuth callback — save ONLY if we explicitly initiated a Gmail scope flow
          const isGmailFlow = localStorage.getItem('dhanrakshak_requesting_gmail_scope') === 'true'
          if (isGmailFlow) {
            saveGoogleToken(session.provider_token)
            setHasGoogleToken(true)
            localStorage.removeItem('dhanrakshak_requesting_gmail_scope')
          } else {
            // Check if this token is actually valid for Gmail (e.g. if Google returned a token with Gmail scope)
            const isValid = await validateGoogleToken(session.provider_token)
            if (isValid) {
              saveGoogleToken(session.provider_token)
              setHasGoogleToken(true)
            } else {
              setHasGoogleToken(isGoogleConnected())
            }
          }
        } else if (event === 'SIGNED_OUT') {
          // Sign-out event — clear access token AND refresh token
          clearAllGoogleTokens()
          setHasGoogleToken(false)
        } else {
          setHasGoogleToken(isGoogleConnected())
        }
        // Note: TOKEN_REFRESHED event does NOT re-issue the Google provider_token
        // so we don't clear hasGoogleToken on that event — the localStorage token
        // (with our 55-min expiry) handles the lifecycle correctly.

        setState({
          user: session?.user ?? null,
          session,
          loading: false,
        })

        if (event === 'SIGNED_IN' && session?.user) {
          // Identify user in PostHog
          identifyUser(session.user.id, {
            email: session.user.email,
            created_at: session.user.created_at,
          })
          // Log signin to DB — fully non-blocking, safe if table is missing
          supabase.from('signin_logs').insert({
            user_id: session.user.id,
            email: session.user.email,
            device_name: getDeviceName(),
          }).then(({ error }) => {
            if (error) console.warn('signin_logs insert failed (non-critical):', error.message)
          })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!state.user) {
      setDeviceCheckRequired(false)
      setActiveSessions([])
      return
    }

    const verifyDeviceSession = async () => {
      const deviceId = getOrCreateDeviceId()
      const metadata = state.user?.user_metadata || {}
      const rawSessions: DeviceSession[] = metadata.user_sessions || []

      // Filter out stale sessions (> 30 days)
      const now = Date.now()
      const thirtyDays = 30 * 24 * 60 * 60 * 1000
      const filtered = rawSessions.filter(s => now - s.lastActive < thirtyDays)

      const isCurrentDeviceLogged = filtered.some(s => s.id === deviceId)

      if (isCurrentDeviceLogged) {
        // Only update lastActive timestamp in Supabase if the last active time is older than 5 minutes
        const currentSession = filtered.find(s => s.id === deviceId)
        const timeDiff = currentSession ? now - currentSession.lastActive : Infinity

        if (timeDiff > 5 * 60 * 1000) {
          const updated = filtered.map(s => s.id === deviceId ? { ...s, lastActive: now } : s)
          await supabase.auth.updateUser({ data: { user_sessions: updated } })
        }
        setDeviceCheckRequired(false)
      } else {
        if (filtered.length < 2) {
          // Add current device
          const updated = [...filtered, { id: deviceId, name: getDeviceName(), lastActive: now }]
          await supabase.auth.updateUser({ data: { user_sessions: updated } })
          setDeviceCheckRequired(false)
        } else {
          // Limit exceeded! Block app access
          setActiveSessions(filtered)
          setDeviceCheckRequired(true)
        }
      }
    }

    verifyDeviceSession()
  }, [state.user])

  useEffect(() => {
    if (!state.user || deviceCheckRequired) return

    // Poll every 5 minutes to check if our device session was revoked (V2: reduced from 10s to prevent Supabase overuse)
    const interval = setInterval(async () => {
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser()
        if (freshUser) {
          const deviceId = getOrCreateDeviceId()
          const rawSessions: DeviceSession[] = freshUser.user_metadata?.user_sessions || []
          const isCurrentDeviceLogged = rawSessions.some(s => s.id === deviceId)

          if (!isCurrentDeviceLogged) {
            // Device session was revoked by another device — silently sign out
            // (the redirect to /login is the user feedback)
            signOut()
          }
        }
      } catch (e) {
        console.error('Error polling session status:', e)
      }
    }, 300000) // 5 minutes

    return () => clearInterval(interval)
  }, [state.user, deviceCheckRequired])



  const handleResolveSessions = async () => {
    if (selectedDevices.length === 0) {
      setSessionModalError('Please select at least one device to sign out.')
      return
    }

    setSessionModalError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      const now = Date.now()
      
      // Remove selected devices
      const remaining = activeSessions.filter(s => !selectedDevices.includes(s.id))
      // Add current device
      const updated = [...remaining, { id: deviceId, name: getDeviceName(), lastActive: now }]

      const { data, error } = await supabase.auth.updateUser({ data: { user_sessions: updated } })
      if (error) throw error

      setDeviceCheckRequired(false)
      // Force state refresh
      setState(prev => ({
        ...prev,
        user: data.user
      }))
    } catch (e: any) {
      setSessionModalError('Failed to update sessions: ' + e.message)
    }
  }

  const handleToggleDeviceSelect = (id: string) => {
    setSelectedDevices(prev => 
      prev.includes(id) ? prev.filter(dId => dId !== id) : [...prev, id]
    )
  }

  // Formatting helper for relative active timestamp
  const formatRelativeTime = (time: number) => {
    const diff = Date.now() - time
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Active just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  if (deviceCheckRequired && state.user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface-0 px-4 py-8" role="main">
        <div className="w-full max-w-md bg-surface-1 border border-border-subtle rounded-3xl p-6 shadow-2xl backdrop-blur-2xl flex flex-col gap-6 animate-scale-up">
          <div className="text-center">
            <span className="text-4xl" aria-hidden="true">📱</span>
            <h1 className="text-xl font-bold text-white mt-4">Device Limit Reached</h1>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Dhanrakshak limits account access to a maximum of <strong>2 devices</strong>. To connect this device, please select at least one active session to disconnect:
            </p>
          </div>

          <div className="space-y-2">
            {activeSessions.map((session) => {
              const isChecked = selectedDevices.includes(session.id)
              return (
                <div
                  key={session.id}
                  onClick={() => handleToggleDeviceSelect(session.id)}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'border-brand-400 bg-brand-500/5 hover:bg-brand-500/10'
                      : 'border-border-subtle bg-surface-2/40 hover:bg-surface-2 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // Controlled by outer div click
                      className="rounded border-zinc-800 bg-surface-2 text-brand-500 focus:ring-brand-500/25 h-4 w-4 pointer-events-none"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-zinc-200">{session.name}</span>
                      <span className="text-[10px] text-zinc-500 mt-0.5">{formatRelativeTime(session.lastActive)}</span>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-0.5 border border-border-subtle rounded-full">
                    Active
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-2">
            {sessionModalError && (
              <div className="rounded-xl bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] px-3 py-2 text-xs text-[var(--status-danger-text)] text-center">
                ⚠️ {sessionModalError}
              </div>
            )}
            <Button
              onClick={handleResolveSessions}
              disabled={selectedDevices.length === 0}
              block
            >
              Sign Out Selected & Connect
            </Button>
            <Button
              variant="secondary"
              onClick={() => signOut()}
              block
            >
              Cancel & Log Out
            </Button>
          </div>
        </div>
      </main>
    )
  }

  const isSubscriptionActive = (() => {
    if (!profile) return false
    if (profile.subscription_status === 'active') {
      if (!profile.subscription_expires_at) return true
      const expiresAt = new Date(profile.subscription_expires_at).getTime()
      return expiresAt > Date.now()
    }
    if (profile.subscription_status === 'trial') {
      const expiresAt = new Date(profile.subscription_expires_at).getTime()
      return expiresAt > Date.now()
    }
    return false
  })()

  const daysLeft = (() => {
    if (!profile || !profile.subscription_expires_at) return 0
    const expiresAt = new Date(profile.subscription_expires_at).getTime()
    const diff = expiresAt - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  })()

  const updateSubscriptionStatus = async (status: 'active' | 'trial', planType?: 'monthly' | 'annual' | 'lifetime', promoCode?: string) => {
    if (!state.user) return false
    try {
      const expiresAt = status === 'active'
        ? new Date(Date.now() + (planType === 'lifetime' ? 36500 : (planType === 'annual' ? 365 : 30)) * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

      const subPlanType = planType || (status === 'active' ? 'monthly' : 'trial')

      // Only write to Supabase profiles from client if we are in local development mode
      // In hosted environments, the serverless payment verification endpoint performs the DB write.
      const isDev = import.meta.env.DEV
      if (isDev) {
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_status: status,
            subscription_expires_at: expiresAt,
            subscription_plan_type: subPlanType,
            promo_code: promoCode || null
          })
          .eq('id', state.user.id)

        if (error) {
          console.warn('Supabase profile update with plan type/promo failed, retrying without these columns:', error.message)
          const { error: retryError } = await supabase
            .from('profiles')
            .update({
              subscription_status: status,
              subscription_expires_at: expiresAt
            })
            .eq('id', state.user.id)
          if (retryError) {
            console.warn('Supabase profile retry update failed:', retryError.message)
          }
        }
      }

      // Always update localStorage fallback
      localStorage.setItem(`dhanrakshak_sub_status_${state.user.id}`, status)
      localStorage.setItem(`dhanrakshak_sub_expires_${state.user.id}`, expiresAt)
      localStorage.setItem(`dhanrakshak_sub_plan_${state.user.id}`, subPlanType)
      if (promoCode) {
        localStorage.setItem(`dhanrakshak_promo_code_${state.user.id}`, promoCode)
      }

      await refreshProfile()
      return true
    } catch (e) {
      console.error('Error updating subscription status:', e)
      return false
    }
  }

  const loading = state.loading || (state.user !== null && profile === null)

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loading,
        profile,
        hasGoogleToken,
        notifyGoogleTokenCleared,
        refreshProfile,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        resetPassword,
        isSubscriptionActive,
        daysLeft,
        updateSubscriptionStatus,
        authModalOpen,
        authModalRedirect,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        currency,
        setCurrency,
        currencySymbol,
        activeYear,
        startNewFinancialYear,
        dailyScanTime,
        updateDailyScanTime
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/** Hook to access auth state and methods */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
