/** Direct declaration probes: do not hide dependency diagnostics with skipLibCheck. */
import type { PgPolicy, PgPolicyConfig } from "drizzle-orm/pg-core/policies";
import type { PgRole, PgRoleConfig } from "drizzle-orm/pg-core/roles";
import type { CockroachPolicy, CockroachPolicyConfig } from "drizzle-orm/cockroach-core/policies";
import type { CockroachRole, CockroachRoleConfig } from "drizzle-orm/cockroach-core/roles";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import type { Effect } from "effect";
import type { SqlError } from "effect/sql/SqlError";

declare const policy: PgPolicy;
declare const role: PgRole;
declare const cockroachPolicy: CockroachPolicy;
declare const cockroachRole: CockroachRole;
export const policyConfig: PgPolicyConfig = policy;
export const roleConfig: PgRoleConfig = role;
export const cockroachPolicyConfig: CockroachPolicyConfig = cockroachPolicy;
export const cockroachRoleConfig: CockroachRoleConfig = cockroachRole;

declare const database: EffectPgDatabase;
declare const transaction: ReturnType<typeof database.transaction>;
type IsAny<T> = 0 extends 1 & T ? true : false;
export const errorsAreTyped: IsAny<Effect.Error<typeof transaction>> = false;
export const sqlErrorIsPreserved: SqlError extends Effect.Error<typeof transaction> ? true : false =
  true;
