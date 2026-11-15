/** Runs Better Auth's own schema check while auth starts and reports a mismatch as one coded failure.
 * Better Auth only logs a mismatch at startup and then rejects every authentication request; RelKit
 * stops activation instead, naming each table and column and the change that resolves it.
 */
import { nativeCall } from "@relkit/drizzle/server";
import { diagnosticDocsUrl } from "relkit/diagnostics/codes";
import { Data, Effect } from "effect";
import { AuthFailure } from "./auth.errors.js";

/** Code RelKit reports when the project's schema cannot hold what Better Auth writes. */
export const AUTH_SCHEMA_MISMATCH = "RELKIT_AUTH_SCHEMA_MISMATCH" as const;

/** One problem Better Auth's schema check found, as its `SchemaMismatchError.findings` holds it. */
export interface AuthSchemaFinding {
  /** `missing-table`, `missing-column` or `unexpected-required-column`. */
  readonly kind: string;
  /** Table name as the adapter addresses it (the Drizzle export name). */
  readonly table: string;
  /** Column name for column findings; absent for a missing table. */
  readonly column?: string;
}

/** The project's schema does not match the installed Better Auth release; auth did not start. */
export class AuthSchemaMismatchError extends Data.TaggedError("AuthSchemaMismatchError")<{
  /** Always {@link AUTH_SCHEMA_MISMATCH}. */
  readonly code: typeof AUTH_SCHEMA_MISMATCH;
  /** Each table and column, the change that resolves it, the next step and the docs link. */
  readonly message: string;
  /** Better Auth's findings, without row data. */
  readonly findings: readonly AuthSchemaFinding[];
}> {}

/**
 * Awaits the schema check Better Auth registered for its adapter, when it has one.
 * @param context - Resolved `auth.$context`; `checkSchema` is absent when validation is disabled.
 * @returns Nothing when the schema matches or cannot be checked now; fails with
 * {@link AuthSchemaMismatchError} inside an {@link AuthFailure} when Better Auth reports a mismatch.
 * @remarks A failure to reach the database is left to Better Auth, which retries it on the next request.
 */
export const checkAuthSchema = Effect.fn("AuthService.checkSchema")(function* (context: object) {
  const check: unknown = Reflect.get(context, "checkSchema");
  if (typeof check !== "function") return;
  yield* nativeCall("auth.schema", () => Reflect.apply(check, context, [])).pipe(
    Effect.asVoid,
    Effect.catch((failure) => {
      const findings = mismatchFindings(failure.cause);
      if (findings === undefined) return Effect.void;
      return Effect.fail(
        new AuthFailure({ operation: "auth.acquire", cause: schemaMismatch(findings) }),
      );
    }),
  );
});

/** Reads the findings of Better Auth's `SchemaMismatchError` (`code` is `SCHEMA_MISMATCH`). */
function mismatchFindings(cause: unknown): readonly AuthSchemaFinding[] | undefined {
  if (cause === null || typeof cause !== "object") return undefined;
  if (Reflect.get(cause, "code") !== "SCHEMA_MISMATCH") return undefined;
  const findings: unknown = Reflect.get(cause, "findings");
  return Array.isArray(findings) ? (findings as AuthSchemaFinding[]) : undefined;
}

/** Builds the coded failure, one line per finding. */
function schemaMismatch(findings: readonly AuthSchemaFinding[]): AuthSchemaMismatchError {
  const lines = findings.map(describe);
  const issuer = findings.some(
    (finding) => finding.table === "account" && finding.column === "issuer",
  );
  const next = issuer
    ? "Run `relkit migrate --write` (or remove `issuer` and the index on it from the account table by hand), then `db:generate` and `db:migrate`."
    : "Change the Drizzle schema as listed, then run `db:generate` and `db:migrate`.";
  const message = [
    `${AUTH_SCHEMA_MISMATCH}: The database schema does not match the installed Better Auth release, so every sign-up and sign-in would fail.`,
    ...lines.map((line) => `  ${line}`),
    `  next: ${next}`,
    `  docs: ${diagnosticDocsUrl(AUTH_SCHEMA_MISMATCH)}`,
  ].join("\n");
  return new AuthSchemaMismatchError({ code: AUTH_SCHEMA_MISMATCH, message, findings });
}

/** States one finding and its resolution. */
function describe(finding: AuthSchemaFinding): string {
  const column = `${finding.table}.${finding.column ?? ""}`;
  if (finding.kind === "missing-table")
    return `Table "${finding.table}" is missing: declare it in the Drizzle schema.`;
  if (finding.kind === "missing-column")
    return `Column ${column} is missing: add it to the Drizzle schema.`;
  if (finding.table === "account" && finding.column === "issuer")
    return "Column account.issuer is required, but Better Auth 1.7.3 and later never write it: remove it and the index on issuer and accountId.";
  return `Column ${column} is required, but Better Auth never writes it: make it nullable, give it a default, or remove it.`;
}
