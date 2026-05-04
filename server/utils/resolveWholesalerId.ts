/**
 * Resolve the effective wholesaler ID from an authenticated request.
 *
 * Team members act on behalf of their parent wholesaler, so their
 * `wholesalerId` field takes precedence over their own `id`.
 * For wholesaler owners (and every other role) we use `req.user.id`.
 */
export function resolveWholesalerId(req: any): string {
  const user = req.user;
  if (!user) throw new Error('resolveWholesalerId: unauthenticated request');
  return (user.role === 'team_member' && user.wholesalerId) ? user.wholesalerId : user.id;
}
