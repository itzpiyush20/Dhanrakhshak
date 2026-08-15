// ============================================
// Admin access — the browser-side half of the gate.
//
// This decides what is DISPLAYED, not what is PERMITTED. A user can edit their
// own JavaScript and make the admin page render; they still get nothing back,
// because every admin SQL function re-checks is_admin server-side and raises.
// Treat this as cosmetic and keep the real guard in the database.
// ============================================

export function canAccessAdmin(
  profile: { is_admin?: boolean } | null | undefined
): boolean {
  return profile?.is_admin === true
}
