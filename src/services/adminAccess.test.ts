import { describe, it, expect } from 'vitest'
import { canAccessAdmin } from './adminAccess'

describe('canAccessAdmin', () => {
  it('allows a profile flagged as admin', () => {
    expect(canAccessAdmin({ is_admin: true })).toBe(true)
  })

  it('refuses a profile not flagged as admin', () => {
    expect(canAccessAdmin({ is_admin: false })).toBe(false)
  })

  // The offline fallback in AuthContext rebuilds the profile from localStorage,
  // which carries no is_admin. Undefined must fail closed, not open.
  it('refuses a profile with no is_admin field at all', () => {
    expect(canAccessAdmin({})).toBe(false)
  })

  it('refuses when there is no profile yet', () => {
    expect(canAccessAdmin(null)).toBe(false)
    expect(canAccessAdmin(undefined)).toBe(false)
  })

  // Defensive: a truthy non-boolean must not be treated as permission.
  it('refuses a non-boolean truthy value', () => {
    expect(canAccessAdmin({ is_admin: 'yes' as unknown as boolean })).toBe(false)
  })
})
