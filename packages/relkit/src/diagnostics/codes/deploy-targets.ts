/** Codes reported for platform deploy targets: build and check rules of the Vercel target. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const deployTargetCodes = [
  {
    code: "RELKIT_VERCEL_CRONS_OUT_OF_DATE",
    title: "Vercel cron entries do not match the schedules",
    happened:
      "`relkit build --target vercel` compared the `crons` in `vercel.json` with the ones the project's schedules need and found them different, or found no `vercel.json`. Vercel Cron only wakes the deployment for the entries in that file, so a schedule without its entry would never run.",
    fix: "Run `relkit check`, then `relkit deploy init vercel --force` to rewrite `vercel.json` from the current schedules, review the change and commit it.",
  },
  {
    code: "RELKIT_VERCEL_LOCAL_DURABLE_STATE",
    title: "Vercel build refused the local provider for durable work",
    happened:
      "`relkit build --target vercel` found jobs, schedules or events whose profile uses the local filesystem provider. A Vercel function keeps no files between invocations, so that work would be lost.",
    fix: "Use the durable Postgres backend from `@relkit/postgres` (`relkit add jobs --provider postgres`, `relkit add events --provider postgres`) with a database the deployment can reach, and set `DATABASE_URL` on the Vercel project.",
  },
  {
    code: "RELKIT_VERCEL_REALTIME_PROVIDER_REQUIRED",
    title: "Realtime channel on Vercel needs an external provider",
    happened:
      "`relkit check` found `vercel.json` in the project and a channel that clients subscribe to whose realtime profile uses the local provider, or no provider. Vercel functions keep no state between invocations and run as many instances as traffic needs, so subscribers would miss events published from another instance.",
    fix: "Select an external realtime provider for the channel's profile, such as `redisRealtime()` from `@relkit/redis` with a Redis the deployment can reach, or deploy the app to a container target such as Railway. Vercel functions also accept no WebSocket upgrades; the Vercel guide describes the realtime limits.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
