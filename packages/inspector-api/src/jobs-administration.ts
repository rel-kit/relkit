/** Native development jobs use the existing admin policy without selecting rich inspection. */
import { Effect, Layer, ManagedRuntime } from "effect";
import type { Hono } from "hono";
import { observeExecution } from "@relkit/contracts/operation";
import { installJobsEndpoints } from "./jobs/routes.js";
import { inspectorNativeJobsLayer } from "./jobs/native.service.js";
import { inspectorLoggerLayer, registerInspectorOwner } from "./execution.js";
import { nativeAttempt, projectionAttempt, runInspectorPromise } from "./native-edge.js";
import { resolveActiveGenerationEffect } from "./generation.js";
import {
  authorized,
  errorResponse,
  json,
  negotiate,
  validateConfiguration,
} from "./router-utils.js";
import type { InspectorApiOptions } from "./router.types.js";

/** Registers only existing jobs routes on the canonical development HTTP app.
 * @param app - Application whose middleware already owns authentication and request security.
 * @param options - Native admin bearer/authorization and selected live provider bindings.
 * @returns Nothing; disposeInspectorEndpoints joins this app's registered owner.
 * @example installJobsAdministrationEndpoints(app, { mode: "development", activeGeneration });
 */
export function installJobsAdministrationEndpoints(app: Hono, options: InspectorApiOptions): void {
  const mode = options.environment ?? options.mode ?? "development";
  if (mode === "production" || options.enabled === false) return;
  validateConfiguration(mode, true, options);
  const owner = ManagedRuntime.make(
    Layer.merge(inspectorNativeJobsLayer, inspectorLoggerLayer(options.logging)),
  );
  registerInspectorOwner(app, owner);
  installJobsEndpoints(
    app,
    (handler) => async (context) => {
      try {
        const access = await runInspectorPromise(owner, jobsAccess(options, context.req.raw));
        if (!access.allowed)
          return json({ error: "RELKIT_INSPECTOR_UNAUTHORIZED" }, 401, {
            "www-authenticate": "Bearer",
          });
        return await handler(context, access.generation);
      } catch (error) {
        return errorResponse(error);
      }
    },
    owner,
  );
}

/** Native policy is checked before negotiating or resolving any provider generation. */
const jobsAccess = Effect.fn("NativeJobs.access")(
  function* (options: InspectorApiOptions, request: Request) {
    if (!(yield* nativeAttempt(() => authorized(request, options))))
      return { allowed: false as const };
    yield* projectionAttempt(() => negotiate(request));
    return { allowed: true as const, generation: yield* resolveActiveGenerationEffect(options) };
  },
  (effect) => observeExecution("inspector", "jobs.native-access", effect),
);
