/**
 * Rules `relkit build --target vercel` enforces before staging. A Vercel function keeps nothing
 * between invocations, so jobs, schedules and events must use an external durable backend: the
 * build refuses the local filesystem provider, as the production image refuses it at startup. And
 * Vercel Cron only wakes the deployment for the entries in `vercel.json`, so the build refuses
 * entries that no longer match the project's schedules.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDiagnostic, type Diagnostic } from "relkit/diagnostics";
import { cliPromise } from "../cli-errors.js";
import { localDurableProfiles } from "./build-durable-warnings.js";
import { vercelCronPlan } from "./deploy-init-vercel-crons.js";

/** Code of the local durable state refusal; documented in the diagnostics catalog. */
export const VERCEL_LOCAL_DURABLE_STATE_CODE = "RELKIT_VERCEL_LOCAL_DURABLE_STATE";
/** Code of the stale cron refusal; documented in the diagnostics catalog. */
export const VERCEL_CRONS_OUT_OF_DATE_CODE = "RELKIT_VERCEL_CRONS_OUT_OF_DATE";

/**
 * Checks a Vercel build.
 * @param projectRoot - Project root holding `vercel.json`.
 * @param graphText - Compiled application graph JSON.
 * @returns Error diagnostics; empty when the build may proceed.
 */
export function vercelBuildErrors(projectRoot: string, graphText: string) {
  return cliPromise("build.vercel.config", async (): Promise<readonly Diagnostic[]> => {
    const errors: Diagnostic[] = [];
    const local = localDurableProfiles(graphText);
    if (local.length > 0)
      errors.push(
        createDiagnostic({
          code: VERCEL_LOCAL_DURABLE_STATE_CODE,
          severity: "error",
          message: `${local.join(", ")} use the local filesystem provider; a Vercel function keeps no files between invocations, so their jobs, schedules and events would be lost.`,
          suggestion:
            "Use the durable Postgres backend from `@relkit/postgres`: run `relkit add jobs --provider postgres` and `relkit add events --provider postgres`.",
        }),
      );
    const stale = await cronMismatch(projectRoot, graphText);
    if (stale !== undefined)
      errors.push(
        createDiagnostic({
          code: VERCEL_CRONS_OUT_OF_DATE_CODE,
          severity: "error",
          message: stale,
          suggestion:
            "Run `relkit check`, then `relkit deploy init vercel --force`, and commit the updated vercel.json.",
        }),
      );
    return errors;
  });
}

/**
 * Compares `vercel.json`'s cron entries with the ones the graph's schedules need.
 * @param projectRoot - Project root.
 * @param graphText - Compiled application graph JSON.
 * @returns Why they differ, or undefined when they match.
 */
async function cronMismatch(projectRoot: string, graphText: string): Promise<string | undefined> {
  const source = await readFile(join(projectRoot, "vercel.json"), "utf8").catch(() => undefined);
  if (source === undefined)
    return "vercel.json is missing, so Vercel Cron would never run the schedules.";
  let crons: unknown;
  try {
    crons = (JSON.parse(source) as { readonly crons?: unknown }).crons ?? [];
  } catch {
    return "vercel.json is not valid JSON.";
  }
  const expected = vercelCronPlan(graphText).crons;
  if (JSON.stringify(crons) === JSON.stringify(expected)) return undefined;
  const wanted = expected.map((cron) => `${cron.schedule} ${cron.path}`).join("; ") || "none";
  return `vercel.json's crons do not match the project's schedules; expected: ${wanted}.`;
}
