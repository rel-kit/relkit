/** Better Auth identity attached to a raw handler.
 * @example const registration: BetterAuthRegistration = { kind: "better-auth", service: { ref: { kind: "service", id: "auth" } } };
 */
export interface BetterAuthRegistration {
  readonly kind: "better-auth";
  readonly service: { readonly ref: { readonly kind: "service"; readonly id: string } };
}
