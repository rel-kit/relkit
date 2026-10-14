/**
 * Plans prerequisite service members and their receiver-owned event/job links.
 * The existing renderer operations own filesystem authority and typed failures;
 * this composition preserves their dependency order and public/internal defaults.
 */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldErrors } from "./generator-errors.js";
import {
  renderErrorEffect,
  renderEventEffect,
  renderFunctionEffect,
  renderTaskEffect,
  renderEventFunctionEffect,
  renderJobEffect,
} from "./render-domain.js";
import { serviceRequest, serviceTaskExecution } from "./render-service-requests.js";
import type { PlanBuilder } from "./plan-builder.js";
import type { DomainArtifact, DomainTarget } from "./domain-planning.types.js";
import type { ServiceInclude } from "./add-types.js";
import type { ServicePrimaryArtifacts } from "./render-service.types.js";

/**
 * Plans errors/events/functions before tasks that may refer to those members.
 * @param builder - Per-request transaction planning owner.
 * @param target - Public boundary and logical service identity.
 * @param selected - Requested capabilities including their closed prerequisites.
 * @returns Lazy prerequisite artifact records with the renderers' typed E/R channels.
 */
export const renderServiceMembersEffect = Effect.fn("Scaffold.renderServiceMembers")(
  function* (builder: PlanBuilder, target: DomainTarget, selected: ReadonlySet<ServiceInclude>) {
    let error: DomainArtifact | undefined;
    if (selected.has("error")) error = yield* renderErrorEffect(builder, target, "example");
    let event: DomainArtifact | undefined;
    if (selected.has("event")) event = yield* renderEventEffect(builder, target, "example");
    let fn: DomainArtifact | undefined;
    if (selected.has("function"))
      fn = yield* renderFunctionEffect(builder, target, "example", {
        ...(error ? { error } : {}),
        ...(event ? { event } : {}),
      });
    let task: DomainArtifact | undefined;
    if (selected.has("task"))
      task = yield* renderTaskEffect(
        builder,
        target,
        serviceRequest(builder, "task", {
          name: "Example",
          version: "1",
          execution: serviceTaskExecution(builder),
        }),
      );
    return { fn, event, task } satisfies ServicePrimaryArtifacts;
  },
  (effect) =>
    observeExecution("generator", "planning.renderServiceMembers", scaffoldErrors(effect)),
);

/**
 * Plans subscribers and jobs after their receiver/event/task targets exist.
 * @param builder - Per-request transaction planning owner.
 * @param target - Shared logical/physical service boundary.
 * @param selected - Closed capability selection.
 * @param primary - Previously planned callable/event/task identities.
 * @returns Lazy completion with the existing renderers' typed failures and filesystem requirement.
 */
export const renderServiceWorkEffect = Effect.fn("Scaffold.renderServiceWork")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    selected: ReadonlySet<ServiceInclude>,
    primary: ServicePrimaryArtifacts,
  ) {
    if (selected.has("event-function"))
      yield* renderEventFunctionEffect(
        builder,
        target,
        serviceRequest(builder, "event-function", {
          name: "On Example",
          event: primary.event?.id ?? "example",
          delivery: "durable",
        }),
      );
    if (selected.has("job"))
      yield* renderJobEffect(
        builder,
        target,
        serviceRequest(builder, "job", {
          name: "Example",
          target: primary.task?.id ?? primary.fn?.id ?? "example",
        }),
      );
  },
  (effect) => observeExecution("generator", "planning.renderServiceWork", scaffoldErrors(effect)),
);
