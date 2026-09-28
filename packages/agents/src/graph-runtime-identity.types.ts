/** Random identity source used by graph invocation Effects. */
export interface GraphInvocationIdentityService {
  readonly randomUUID: () => string;
}
