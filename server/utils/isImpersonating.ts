/**
 * Returns true if the current request is being made by a super admin who has
 * impersonated a wholesaler account.  When this returns true, tracking fields
 * (lastSeenAt, lastRealUserActivityAt, etc.) must NOT be updated on the target
 * wholesaler so that real-user metrics stay clean.
 */
export function isImpersonating(req: any): boolean {
  // The _adminEmail field is set by requireAuth in googleAuth.ts only when a
  // valid impersonation token was presented.
  return typeof req._adminEmail === "string" && req._adminEmail.length > 0;
}
