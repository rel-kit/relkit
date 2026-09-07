import type { AddRequest, ScaffoldPlan } from "./add-types.js";
import { resolveDomain } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { discoverProject } from "./project-discovery.js";
import { renderAgent, renderTool } from "./render-ai.js";
import { renderAuth } from "./render-auth.js";
import { renderDatabase } from "./render-database.js";
import {
  renderConstants,
  renderError,
  renderEvent,
  renderEventFunction,
  renderFunction,
  renderJob,
  renderPrompt,
} from "./render-domain.js";
import { renderBucket, renderCache } from "./render-resources.js";
import { renderMiddleware, renderRoute, renderTransform } from "./render-routes.js";
import { renderService } from "./render-service.js";

/** Inspects a project and produces one complete, conflict-checked add plan. */
export async function planAdd(request: AddRequest): Promise<ScaffoldPlan> {
  const builder = new PlanBuilder(request, await discoverProject(request.projectRoot));
  if (request.kind === "service") await renderService(builder, request);
  else if (request.kind === "route") {
    const target = request.mode === "service-route" ? await resolveDomain(builder) : undefined;
    if (target && !target.service) {
      for (const member of new Set(Object.values(request.maps))) {
        await renderFunction(builder, target, member);
      }
    }
    await renderRoute(builder, request, target);
  } else if (request.kind === "middleware") await renderMiddleware(builder, request);
  else if (request.kind === "transform") await renderTransform(builder, request);
  else if (request.kind === "database") await renderDatabase(builder, request);
  else if (request.kind === "auth") await renderAuth(builder, request);
  else {
    const target = await resolveDomain(builder);
    if (request.kind === "function") await renderFunction(builder, target, request.name, request);
    else if (request.kind === "error") await renderError(builder, target, request.name);
    else if (request.kind === "event") await renderEvent(builder, target, request.name, request);
    else if (request.kind === "event-function") await renderEventFunction(builder, target, request);
    else if (request.kind === "job") await renderJob(builder, target, request);
    else if (request.kind === "cache") await renderCache(builder, target, request);
    else if (request.kind === "bucket") await renderBucket(builder, target, request);
    else if (request.kind === "tool") await renderTool(builder, target, request);
    else if (request.kind === "prompt")
      await renderPrompt(builder, target, request.name, request.text);
    else if (request.kind === "agent") await renderAgent(builder, target, request);
    else if (request.kind === "constants") await renderConstants(builder, target, request.name);
  }
  return builder.finish();
}
