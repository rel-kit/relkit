/** Codes reported by inspector. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const inspectorCodes = [
  {
    code: "RELKIT_AGENT_CANCELLED",
    title: "Agent run was cancelled",
    happened: "The agent stopped because its caller cancelled the run or its abort signal fired.",
    fix: "If you did not mean to cancel it, check where the abort signal comes from (a closed request, a client disconnect) and run the agent again.",
  },
  {
    code: "RELKIT_AGENT_DEADLINE_INVALID",
    title: "Agent timeout or deadline is invalid",
    happened:
      "The `timeoutMs` or `deadlineMs` passed to the agent run is not a finite, non-negative whole number.",
    fix: "Pass `timeoutMs` as a non-negative whole number of milliseconds, and `deadlineMs` as a finite timestamp.",
  },
  {
    code: "RELKIT_AGENT_INPUT_VALIDATION",
    title: "Agent input is invalid",
    happened:
      "The input passed to the agent did not match its input schema, so the agent did not run.",
    fix: "Check the listed validation issues and fix the input, or update the agent's input schema.",
  },
  {
    code: "RELKIT_AGENT_INVOCATION_FAILED",
    title: "Agent run failed",
    happened: "The agent run failed with an error that has no more specific code.",
    fix: "Check the error's cause in the full output and the app logs. If it comes from RelKit itself, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_AGENT_JSON_INVALID",
    title: "Agent value is not plain JSON",
    happened:
      "A value passed into or out of the agent, such as its input, output or a tool result, could not be converted to JSON.",
    fix: "Use only JSON values. Convert dates, class instances, functions and other values to plain data first.",
  },
  {
    code: "RELKIT_AGENT_LIMIT_INVALID",
    title: "Agent size limit is invalid",
    happened:
      "The agent's `maxInputBytes` or `maxOutputBytes` is not a positive whole number, or it is above the model's limit.",
    fix: "Set `maxInputBytes` and `maxOutputBytes` to positive whole numbers no larger than the model allows, or remove them to use the defaults.",
  },
  {
    code: "RELKIT_AGENT_MODEL_ERROR",
    title: "Model returned an error",
    happened: "The model provider returned an error or a response the agent could not use.",
    fix: "Check the provider's error in the full output, your API key and quota, and the provider's status page, then try again.",
  },
  {
    code: "RELKIT_AGENT_MODEL_UNAVAILABLE",
    title: "Agent model is not available",
    happened:
      "The agent's model could not be resolved from the model registry or its configuration.",
    fix: "Check the agent's `model` setting and that a model with that name is configured for this environment.",
  },
  {
    code: "RELKIT_AGENT_OUTPUT_VALIDATION",
    title: "Agent output is invalid",
    happened: "The agent's final answer did not match its output schema.",
    fix: "Make the output schema and its descriptions clearer in the agent's instructions, or loosen the schema if the answer is acceptable.",
  },
  {
    code: "RELKIT_AGENT_RESPONSE_LIMIT",
    title: "Agent value is too large",
    happened: "A value passed into or out of the agent was larger than its byte limit.",
    fix: "Send less data to the agent or ask for a shorter answer, or raise `maxInputBytes` or `maxOutputBytes`.",
  },
  {
    code: "RELKIT_AGENT_STEP_LIMIT",
    title: "Agent hit its step limit",
    happened: "The agent used every step its limit allows without producing a final answer.",
    fix: "Raise the agent's step limit, or give it clearer instructions or fewer tools so it can finish sooner.",
  },
  {
    code: "RELKIT_AGENT_TIMEOUT",
    title: "Agent run timed out",
    happened: "The agent did not finish before its time limit or deadline.",
    fix: "Raise the agent's `timeoutMs` limit, or reduce the work it has to do, for example with fewer steps or faster tools.",
  },
  {
    code: "RELKIT_AGENT_TOOL_LIMIT",
    title: "Agent hit its tool-call limit",
    happened:
      "The agent made as many tool calls as its limit allows without producing a final answer.",
    fix: "Raise the agent's `maxToolCalls` limit, or give it clearer instructions so it needs fewer tool calls.",
  },
  {
    code: "RELKIT_APPROVAL_INVALID",
    title: "Approval request is invalid",
    happened: "An approval could not be processed because its data is invalid.",
    fix: "Check the approval data you pass when approving or denying a tool call. Use the approval exactly as RelKit returned it.",
  },
  {
    code: "RELKIT_APPROVAL_STATE_INVALID",
    title: "Approval cannot change to this state",
    happened:
      "An approval record is malformed, or it was asked to move to a state it cannot reach, such as approving one that is already settled.",
    fix: "Load the latest approval before acting on it, and only approve or deny approvals that are still pending.",
  },
  {
    code: "RELKIT_DOCKER_ARGUMENT_INVALID",
    title: "Docker setting is invalid",
    happened:
      "A value used to build a Docker command, such as an image, container name or port, is not valid.",
    fix: "Check the local service's Docker settings in `relkit.config.ts` for invalid names, images or ports.",
  },
  {
    code: "RELKIT_DOCKER_CANCELLED",
    title: "Docker operation was cancelled",
    happened: "A Docker operation stopped because it was cancelled before it finished.",
    fix: "If you did not mean to cancel it, run the command again.",
  },
  {
    code: "RELKIT_DOCKER_COMMAND_FAILED",
    title: "Docker command failed",
    happened: "A Docker command run by RelKit exited with an error.",
    fix: "Check the exit code and Docker's output, then run `docker ps` and `docker logs` for the container to see what went wrong.",
  },
  {
    code: "RELKIT_DOCKER_COMMAND_TIMEOUT",
    title: "Docker command timed out",
    happened: "A Docker command run by RelKit did not finish in time.",
    fix: "Make sure Docker is responsive (`docker info`) and that image pulls are not stuck, then try again.",
  },
  {
    code: "RELKIT_DOCKER_HEALTH_FAILED",
    title: "Docker container is unhealthy",
    happened: "A local service container started but its health check reported it as unhealthy.",
    fix: "Run `docker logs` for the container to see why it is failing, fix its settings, then start local services again.",
  },
  {
    code: "RELKIT_DOCKER_HEALTH_TIMEOUT",
    title: "Docker container did not become healthy",
    happened: "A local service container did not report healthy before the wait time ran out.",
    fix: "Run `docker logs` for the container to see if it is still starting or stuck. Free up resources or retry if it is slow to start.",
  },
  {
    code: "RELKIT_DOCKER_OUTPUT_LIMIT",
    title: "Docker output is too large",
    happened: "A Docker command printed more output than RelKit is willing to read.",
    fix: "Run the Docker command yourself to see its output. Report this on the RelKit issue tracker with the full output if it keeps happening.",
  },
  {
    code: "RELKIT_DOCKER_RESPONSE_INVALID",
    title: "Docker returned unexpected data",
    happened: "Docker returned output that RelKit could not read.",
    fix: "Update Docker to a current version and try again. If it keeps happening, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_DOCKER_UNAVAILABLE",
    title: "Docker is not available",
    happened: "RelKit could not run Docker, so local services that need it cannot start.",
    fix: "Install Docker and start the Docker daemon, then check it works with `docker info`.",
  },
  {
    code: "RELKIT_EFFECT_MQ_RUNTIME_UNBOUND",
    title: "effect-mq jobs are not connected",
    happened: "A job operation ran before the effect-mq provider was connected to its database.",
    fix: "Configure the effect-mq jobs profile with a Postgres URL in `relkit.config.ts` for this environment.",
  },
  {
    code: "RELKIT_EFFECT_MQ_WORKER_MUST_BE_REGISTERED_BEFORE_USE",
    title: "effect-mq worker registered too late",
    happened: "An effect-mq worker was registered after the jobs client was already in use.",
    fix: "Register the worker during startup, before any job is submitted or read.",
  },
  {
    code: "RELKIT_GENERATED_FUNCTION_UNBOUND",
    title: "Agent function has no runtime",
    happened:
      "The function RelKit generates for an agent was called before an agent runtime was set up for it.",
    fix: "Make sure the agent's integration package, such as `@relkit/langchain`, is installed and the agent is part of the app, then run `relkit build` again.",
  },
  {
    code: "RELKIT_GRAPH_INTERRUPTED",
    title: "Agent is waiting for input",
    happened:
      "The agent's graph paused to wait for human input. This is a normal pause, not a failure.",
    fix: "Answer the waiting request to resume the agent. If you see it as an error, make sure your code does not catch and rethrow it.",
  },
  {
    code: "RELKIT_INNGEST_EVENT_INVALID",
    title: "Inngest event is missing RelKit data",
    happened: "An Inngest function received an event without the RelKit data or input it needs.",
    fix: "Submit jobs through RelKit instead of sending raw Inngest events to RelKit job functions.",
  },
  {
    code: "RELKIT_INNGEST_SCHEDULE_DEFINITION_INVALID",
    title: "Inngest schedule is incomplete",
    happened:
      "A scheduled Inngest run fired for a job definition that is missing its job, task or build ID.",
    fix: "Run `relkit build` again and redeploy so the Inngest functions match the current build.",
  },
  {
    code: "RELKIT_INSPECTION_INCOMPLETE",
    title: "Inspector data is incomplete",
    happened:
      "The Inspector dropped some records, for example because its buffers were full, so what it shows may have gaps.",
    fix: "Treat the shown data as partial. Reduce how much the app records during inspection, or restart the inspection session.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTIONS_DISABLED",
    title: "Inspector actions are turned off",
    happened:
      "The Inspector rejected an action, such as retry or cancel, because actions are disabled in production.",
    fix: "Run the action from a development environment, or use your app's own tools for this in production.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTIONS_UNAVAILABLE",
    title: "Inspector actions are not available",
    happened: "The running app does not provide the service the Inspector needs to run actions.",
    fix: "Make sure the app is running with the Inspector enabled, then refresh the Inspector.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_FAILED",
    title: "Inspector action failed",
    happened: "An action started from the Inspector failed in the running app.",
    fix: "Check the app logs for the error behind the action, fix it, and try the action again.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_GENERATION_UNAVAILABLE",
    title: "Inspector has no active app build",
    happened: "The Inspector could not find an active build of the app to run the action against.",
    fix: "Wait for the app to finish starting or reloading, then refresh the Inspector and try again.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_NOT_FOUND",
    title: "Inspector action target not found",
    happened:
      "The item the Inspector action targets, such as a job run or message, no longer exists.",
    fix: "Refresh the Inspector to load the current items, then try again.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_PROTOCOL_MISMATCH",
    title: "Inspector and app versions differ",
    happened: "The Inspector and the service handling the action use different protocol versions.",
    fix: "Update all `@relkit/*` packages to the same version, then restart the app and refresh the Inspector.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_REQUEST_INVALID",
    title: "Inspector action request is invalid",
    happened: "The Inspector sent an action request the app could not read.",
    fix: "Refresh the Inspector and try again. If it keeps happening, make sure the Inspector and app use the same RelKit version.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_STATE_INELIGIBLE",
    title: "Item cannot take this action now",
    happened:
      "The action does not fit the item's current state, such as retrying something that has not failed or cancelling something that already finished.",
    fix: "Refresh the Inspector to see the item's current state, then pick an action that fits it.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_TARGET_INVALID",
    title: "Inspector action target is invalid",
    happened: "The Inspector action named a target that is not valid for that action.",
    fix: "Refresh the Inspector and start the action again from the item itself.",
  },
  {
    code: "RELKIT_INSPECTOR_ACTION_UNSUPPORTED",
    title: "Action is not supported by this provider",
    happened: "The provider behind this item does not support the requested Inspector action.",
    fix: "Use the provider's own tools for this action, or switch to a provider that supports it.",
  },
  {
    code: "RELKIT_INSPECTOR_API_VERSION_UNSUPPORTED",
    title: "Inspector API version not supported",
    happened: "The Inspector asked for an API version that the running app does not support.",
    fix: "Update all `@relkit/*` packages to the same version, then restart the app and refresh the Inspector.",
  },
  {
    code: "RELKIT_INSPECTOR_APPROVAL_STATE_INELIGIBLE",
    title: "Approval is no longer pending",
    happened:
      "The Inspector tried to approve or deny a tool call that is no longer waiting for a decision.",
    fix: "Refresh the Inspector to see the approval's current state.",
  },
  {
    code: "RELKIT_INSPECTOR_ENVIRONMENT_MISMATCH",
    title: "Inspector is pointed at another environment",
    happened:
      "The Inspector action was meant for a different environment than the one the app is running in.",
    fix: "Connect the Inspector to the app in the environment you want to act on, then try again.",
  },
  {
    code: "RELKIT_INSPECTOR_GENERATION_NOT_ACTIVE",
    title: "App changed since the Inspector loaded",
    happened:
      "The app was rebuilt or reloaded after the Inspector loaded, so the action targets an old build.",
    fix: "Refresh the Inspector to load the current build, then try the action again.",
  },
  {
    code: "RELKIT_INSPECTOR_GRAPH_UNAVAILABLE",
    title: "App graph is not available",
    happened: "The Inspector could not load the app graph from the running app.",
    fix: "Make sure the app finished starting, then refresh the Inspector. Run `relkit build` again if the build output is missing.",
  },
  {
    code: "RELKIT_INSPECTOR_IDEMPOTENCY_CONFLICT",
    title: "Action ID reused for a different action",
    happened:
      "An Inspector action was sent with an operation ID that was already used for a different request.",
    fix: "Use a new operation ID for each distinct action. Reuse an ID only to retry the exact same action.",
  },
  {
    code: "RELKIT_INSPECTOR_INTERNAL",
    title: "Inspector endpoint error",
    happened: "An Inspector endpoint failed with an unexpected error.",
    fix: "Check the app logs for the error. If it comes from RelKit itself, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_CURSOR_INVALID",
    title: "Inspector jobs cursor is invalid",
    happened:
      "A page cursor sent to the Inspector jobs endpoints is malformed or belongs to another query.",
    fix: "Refresh the Inspector jobs view to start again from the first page.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_FILTER_INVALID",
    title: "Inspector jobs filter is invalid",
    happened: "A filter or page size sent to the Inspector jobs endpoints is missing or not valid.",
    fix: "Check the filter values, such as the service and the page size, and try again.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED",
    title: "Jobs filter not supported by this provider",
    happened: "The job provider does not support the filter used in the Inspector.",
    fix: "Remove that filter, or switch to a job provider that supports it.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_FORBIDDEN",
    title: "Inspector jobs access denied",
    happened: "The Inspector is not allowed to view or manage these jobs.",
    fix: "Check the jobs administration access rules for the Inspector and the credentials it uses.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_NOT_FOUND",
    title: "Job not found in the Inspector",
    happened: "The job, run or definition requested by the Inspector does not exist.",
    fix: "Refresh the Inspector. If the app was rebuilt, the job may have been renamed or removed.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_OPERATION_INVALID",
    title: "Inspector jobs request is invalid",
    happened:
      "The Inspector sent a jobs request with a missing or invalid body, such as a missing ID.",
    fix: "Refresh the Inspector and try again. If it keeps happening, make sure the Inspector and app use the same RelKit version.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED",
    title: "Job action not supported by this provider",
    happened: "The job provider does not support the requested operation, such as cancel or retry.",
    fix: "Use the provider's own tools for this operation, or switch to a provider that supports it.",
  },
  {
    code: "RELKIT_INSPECTOR_JOBS_UNAVAILABLE",
    title: "Jobs are not available in the Inspector",
    happened: "The running app has no job service the Inspector can use.",
    fix: "Make sure the app defines jobs and a jobs profile is configured in `relkit.config.ts`, then restart the app.",
  },
  {
    code: "RELKIT_INSPECTOR_PROTOCOL_UNSUPPORTED",
    title: "Inspector protocol not supported",
    happened: "The Inspector used a protocol that the running app does not support.",
    fix: "Update all `@relkit/*` packages to the same version, then restart the app and refresh the Inspector.",
  },
  {
    code: "RELKIT_INSPECTOR_QUERY_INVALID",
    title: "Inspector query is invalid",
    happened: "A query sent to the Inspector endpoints had invalid parameters.",
    fix: "Check the query parameters and try again. Refresh the Inspector if the request came from it.",
  },
  {
    code: "RELKIT_JOBS_SERVICE_UNAVAILABLE",
    title: "Job service is not available",
    happened:
      "The job provider reported that its service is not available, so the Inspector could not read job runs.",
    fix: "Make sure the job provider is running and reachable, then refresh the Inspector.",
  },
  {
    code: "RELKIT_LOCAL_LEASE_BUSY",
    title: "Local project is busy",
    happened: "Another RelKit process is changing this project's local state right now.",
    fix: "Wait a few seconds and try again. If no other RelKit command is running, check `relkit local status`.",
  },
  {
    code: "RELKIT_LOCAL_LEASE_INVALID",
    title: "Local project lock is damaged",
    happened:
      "The lock file RelKit uses for this project's local services is missing data or is not valid.",
    fix: "Stop local services with `relkit local stop`, then run `relkit local reset` if the problem stays.",
  },
  {
    code: "RELKIT_LOCAL_OVERRIDE_INVALID",
    title: "Local provider settings are invalid",
    happened: "The saved local provider settings for this project are damaged or not valid.",
    fix: "Run `relkit local reset` to clear local state, then start your local services again.",
  },
  {
    code: "RELKIT_LOCAL_OVERRIDE_STALE",
    title: "Local provider settings are out of date",
    happened: "The saved local provider settings were made for a different build of the app.",
    fix: "Restart local services with `relkit dev` so the settings are written for the current build.",
  },
  {
    code: "RELKIT_LOCAL_STATE_INVALID",
    title: "Local state is invalid",
    happened:
      "A file in the project's `.relkit/state` folder is in the wrong place, too large or not valid.",
    fix: "Run `relkit local reset` to clear local state. Do not link or move files inside `.relkit/state` by hand.",
  },
  {
    code: "RELKIT_OBSERVABILITY_INTERNAL",
    title: "Observability endpoint error",
    happened: "An observability endpoint used by the Inspector failed with an unexpected error.",
    fix: "Check the app logs for the error. If it comes from RelKit itself, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_OBSERVABILITY_NOT_FOUND",
    title: "Trace or record not found",
    happened: "The trace, log or other record the Inspector asked for does not exist.",
    fix: "Refresh the Inspector. Older records may have been removed from the store.",
  },
  {
    code: "RELKIT_OBSERVABILITY_UNAUTHORIZED",
    title: "Observability request is not authorized",
    happened:
      "A request to the observability endpoints was rejected because it had no valid credentials.",
    fix: "Send the configured bearer token with the request, or check the `bearerToken` or `authorize` option on the Inspector endpoints.",
  },
  {
    code: "RELKIT_OBSERVABILITY_UNAVAILABLE",
    title: "Observability data is not available",
    happened: "The running app has no observability store that can answer this query.",
    fix: "Make sure observability is enabled for the app and its store is running, then refresh the Inspector.",
  },
  {
    code: "RELKIT_TOOL_FAILED",
    title: "Tool call failed",
    happened:
      "A tool the agent called failed with an error that is not one of the tool's declared errors.",
    fix: "Check the app logs for the tool's error and fix it, or declare the error on the tool so the agent can handle it.",
  },
  {
    code: "RELKIT_TRIGGER_SCOPE_MISMATCH",
    title: "Trigger.dev run belongs to another scope",
    happened: "A Trigger.dev run was read from a scope other than the one it was created in.",
    fix: "Read the run with the same scope used to submit it. Check how your app resolves the job scope for the caller.",
  },
  {
    code: "RELKIT_TRIGGER_SDK_UNAVAILABLE",
    title: "Trigger.dev SDK is not installed",
    happened: "RelKit could not load the `@trigger.dev/sdk` package.",
    fix: "Install `@trigger.dev/sdk` in your app with `bun add @trigger.dev/sdk`, then restart.",
  },
  {
    code: "RELKIT_TRIGGER_SUBSCRIPTION_CURSOR_UNSUPPORTED",
    title: "Trigger.dev cannot resume from a cursor",
    happened:
      "A watch on a Trigger.dev run asked to resume from a position, which Trigger.dev run watches do not support.",
    fix: "Start the watch from the beginning instead of passing a resume position.",
  },
  {
    code: "RELKIT_TRIGGER_TASK_FACTORY_UNAVAILABLE",
    title: "Trigger.dev SDK has no task function",
    happened:
      "The installed `@trigger.dev/sdk` does not provide a function RelKit can use to create tasks.",
    fix: "Install a version of `@trigger.dev/sdk` that includes the `v3` entry point, then restart.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
