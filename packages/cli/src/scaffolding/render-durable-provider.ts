/**
 * Plans `relkit add jobs` and `relkit add events`: a provider profile in
 * relkit.config.ts (Postgres or local), its package dependency, and for
 * Postgres the `DATABASE_URL` secret declaration. The profile becomes the
 * default when the app has none; otherwise a warning names the existing
 * default. Planning only records edits; the add transaction writes, installs
 * and verifies them, and restores every file when a later step fails.
 */
import { Effect } from "effect";
import { observeExecution } from "relkit/contracts/operation";
import { scaffoldErrors } from "create-relkit/generator-errors";
import type { AddRequest } from "create-relkit/add-types";
import { PlanBuilder } from "./plan-builder.js";
import { ensureProviderProfileEffect } from "./provider-planning.js";

/**
 * Plans the provider profile for a jobs or events request.
 * @param builder - Per-request planning owner holding discovery facts and planned edits.
 * @param request - Normalized jobs or events request.
 * @returns Lazy completion after the edits, dependency and warnings are recorded; an existing
 * profile of the same name with another adapter fails as a usage error.
 */
export const renderDurableProviderEffect = Effect.fn("Scaffold.renderDurableProvider")(
  function* (builder: PlanBuilder, request: Extract<AddRequest, { kind: "jobs" | "events" }>) {
    const capability = request.kind === "jobs" ? "job" : "event";
    const name = yield* ensureProviderProfileEffect(builder, capability, {
      requested: request.profile,
      provider: request.provider,
    });
    const profile = builder.profiles.find(
      (item) => item.capability === capability && item.name === name,
    );
    const fallback = builder.profiles.find(
      (item) => item.capability === capability && item.isDefault,
    );
    if (profile?.isDefault !== true && fallback !== undefined && fallback.name !== name)
      yield* builder.warningEffect(
        "provider-profile-not-default",
        `${request.kind === "jobs" ? "Jobs" : "Events"} still use the default profile ${fallback.name}; select ${name} with a profile option or change defaults.${request.kind === "jobs" ? "jobs" : "event"}.`,
      );
    if (request.provider === "postgres")
      yield* builder.warningEffect(
        "database-url-required",
        "Set DATABASE_URL to the Postgres connection string before starting the app.",
      );
  },
  (effect) =>
    observeExecution("generator", "planning.renderDurableProvider", scaffoldErrors(effect)),
);
