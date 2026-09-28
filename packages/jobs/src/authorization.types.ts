/** Trusted application and tenant context for a jobs authorization decision.
 * The scope may be narrowed by a policy but never broadened.
 * @example const trusted: TrustedJobScope = { application: "app", environment: "test", scope: "tenant:a" };
 */
export interface TrustedJobScope {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly subject?: string;
}
