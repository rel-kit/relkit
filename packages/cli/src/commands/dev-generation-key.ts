import type { SupervisorCandidateToken } from "@relkit/supervisor";

/** Builds the generation identity used by session-owned drain lookups.
 * @param token - SDK identity pair.
 * @returns Stable session-local key.
 */
export function tokenKey(token: SupervisorCandidateToken): string {
  return `${token.sourceToken}:${token.generationToken}`;
}
