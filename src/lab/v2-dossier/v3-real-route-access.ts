/**
 * R14.1 — explicit, fail-closed gate for the V3 REAL lab route in production.
 *
 * Before this: `process.env.NODE_ENV === "production"` alone fully blocked
 * the route with `notFound()`. On any real Next.js deployment (`next build` /
 * `next start`), NODE_ENV is always "production" — so the route was
 * unconditionally 404 in every real environment, even though the V3 code
 * itself works (see V3-R14.0 audit). That default is NOT weakened here:
 * production stays blocked UNLESS this flag is set to the exact string
 * "true" — the same strict-equality convention already used by
 * NEXT_PUBLIC_REVENUS_MOCK (see revenus-mock.ts). Any other value — absent,
 * "false", "1", "yes", "TRUE", an empty string — stays blocked. This is a
 * controlled opening for our own test/crash-test environment, never a
 * promotion of V3 to public production.
 */
export function isV3RealTestRouteEnabled(): boolean {
  return process.env.ENABLE_V3_REAL_TEST_ROUTE === "true";
}
