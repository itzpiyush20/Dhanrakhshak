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
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { Button } from '@/components/ui'
import { identifyUser, resetAnalytics, track, EVENTS } from '@/services/analytics'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  profile: any
  refreshProfile: () => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
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
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  })

  const [deviceCheckRequired, setDeviceCheckRequired] = useState(false)
  const [activeSessions, setActiveSessions] = useState<DeviceSession[]>([])
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [profile, setProfile] = useState<any>(null)

  const refreshProfile = async () => {
    if (!state.user) {
      setProfile(null)
      return
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', state.user.id)
        .single()
      if (!error && data) {
        setProfile(data)
      }
    } catch (e) {
      console.error('Error fetching profile in AuthContext:', e)
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

  const signInWithGoogle = async () => {
    track(EVENTS.GOOGLE_OAUTH_STARTED)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        redirectTo: `${window.location.origin}/dashboard`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
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
      setState({
        user: null,
        session: null,
        loading: false,
      })
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') || key.includes('supabase') || key.includes('oauth')) {
          localStorage.removeItem(key)
        }
      }
      window.location.href = '/login'
    }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    return { error: error?.message ?? null }
  }

  useEffect(() => {
    refreshProfile()
  }, [state.user])

  useEffect(() => {
    // Get initial session — with 10s timeout to prevent app hanging on stale auth
    const sessionPromise = supabase.auth.getSession()
    const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), 10000)
    )

    Promise.race([sessionPromise, timeoutPromise]).then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session: session ?? null,
        loading: false,
      })
    }).catch(() => {
      // Auth timed out or failed — allow the app to load
      setState({ user: null, session: null, loading: false })
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
            // Device session was revoked by another device! Sign out.
            alert('Your session has been terminated because this account was logged in on a 3rd device.')
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
      alert('Please select at least one device to sign out.')
      return
    }

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
      alert('Failed to update sessions: ' + e.message)
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

  return (
    <AuthContext.Provider
      value={{ ...state, profile, refreshProfile, signUp, signIn, signInWithGoogle, signOut, resetPassword }}
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
