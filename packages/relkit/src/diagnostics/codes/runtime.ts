/** Codes reported by runtime. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const runtimeCodes = [
  {
    code: "RELKIT_APPROVAL_DENIED",
    title: "Tool call was denied",
    happened: "A tool call that needs approval was denied, so the tool did not run.",
    fix: "Nothing is broken. If the call should have run, approve it the next time it is requested, or change the tool's approval policy.",
  },
  {
    code: "RELKIT_APPROVAL_REQUIRED",
    title: "Tool call needs approval",
    happened:
      "The agent tried to call a tool that requires approval, so the call is paused until someone approves or denies it.",
    fix: "Approve or deny the pending call, for example from the Inspector. Remove the approval requirement from the tool if it should run without review.",
  },
  {
    code: "RELKIT_CANCELLED",
    title: "Operation was cancelled",
    happened:
      "The operation stopped because its caller cancelled it or its abort signal fired before it finished.",
    fix: "If you did not mean to cancel it, check where the abort signal comes from (a closed request, a client disconnect) and retry the operation.",
  },
  {
    code: "RELKIT_DEPENDENCY_NOT_CONFIGURED",
    title: "Dependency is not configured",
    happened:
      "A function used a managed dependency, such as a cache or database profile, that has no provider configured for this environment.",
    fix: "Add the named profile to `relkit.config.ts` for this environment, or pass a replacement for it in tests.",
  },
  {
    code: "RELKIT_DESCRIPTOR_IDENTITY_CONFLICT",
    title: "Definition has conflicting IDs",
    happened:
      "A function or other definition was registered with an ID that differs from the one it already has, or the ID is not a valid stable ID.",
    fix: "Give each definition one stable ID and register it only once. Check for the same definition exported under two different IDs.",
  },
  {
    code: "RELKIT_EVENT_DEPENDENCY_UNDECLARED",
    title: "Event is not declared on this function",
    happened:
      "A function published an event that is not listed in its declared event dependencies.",
    fix: "Add the event to the function's declared events, then run `relkit build` again.",
  },
  {
    code: "RELKIT_EVENT_PAYLOAD_VALIDATION",
    title: "Event payload is invalid",
    happened: "The payload passed to an event publish did not match the event's schema.",
    fix: "Check the listed validation issues and fix the payload, or update the event's schema if the payload is correct.",
  },
  {
    code: "RELKIT_EVENT_PROFILE_UNKNOWN",
    title: "Event profile is not configured",
    happened:
      "An event was published through a profile that is not configured for this environment.",
    fix: "Add the event profile to `relkit.config.ts`, or point the event at a profile that exists.",
  },
  {
    code: "RELKIT_EVENT_PROVIDER_UNAVAILABLE",
    title: "Event provider cannot publish",
    happened: "The configured event provider does not support publishing events.",
    fix: "Configure an event provider that supports publishing for this profile in `relkit.config.ts`.",
  },
  {
    code: "RELKIT_INPUT_VALIDATION",
    title: "Input is invalid",
    happened:
      "The input passed to a function did not match its input schema, so the function did not run.",
    fix: "Check the listed validation issues and fix the caller's input, or update the function's input schema.",
  },
  {
    code: "RELKIT_INSPECTOR_NOT_FOUND",
    title: "Inspector item not found",
    happened:
      "The Inspector asked for a node, run or other item that does not exist in the running app.",
    fix: "Refresh the Inspector. If the app was rebuilt or restarted, the item may no longer exist.",
  },
  {
    code: "RELKIT_INSPECTOR_RUNTIME_UNAVAILABLE",
    title: "Inspector cannot reach the runtime",
    happened: "The Inspector endpoint could not read data from the running app.",
    fix: "Make sure the app is running and finished starting, then refresh the Inspector. Check the app's logs for startup errors.",
  },
  {
    code: "RELKIT_INSPECTOR_UNAUTHORIZED",
    title: "Inspector request is not authorized",
    happened:
      "A request to the Inspector endpoints was rejected because it had no valid credentials.",
    fix: "Send the configured bearer token with the request, or check the `bearerToken` or `authorize` option on the Inspector endpoints.",
  },
  {
    code: "RELKIT_JOB_ACCESS_DENIED",
    title: "Job access denied",
    happened:
      "The caller is not allowed to see or change this job run, or the run belongs to another scope.",
    fix: "Check the job's authorization rules and the scope your request resolves to. Make sure the caller is signed in with the right access.",
  },
  {
    code: "RELKIT_JOB_CURSOR_INVALID",
    title: "Job cursor is invalid",
    happened:
      "A page cursor sent to a jobs endpoint is malformed, too long, or was issued for a different request.",
    fix: "Use the cursor exactly as returned by the previous page, with the same filters. Start again from the first page if unsure.",
  },
  {
    code: "RELKIT_JOB_PROTOCOL_UNSUPPORTED",
    title: "Jobs protocol version not supported",
    happened: "The client asked for a jobs protocol version that this server does not support.",
    fix: "Update the client and server to matching `@relkit/*` package versions, then rebuild and redeploy.",
  },
  {
    code: "RELKIT_JOB_PUBLIC_CONTRACT_STALE",
    title: "Client job contract is out of date",
    happened:
      "The client was built against a different version of the app's public job contract than the server is running.",
    fix: "Rebuild the client and the server from the same source with `relkit build`, then deploy them together.",
  },
  {
    code: "RELKIT_JOB_RUN_NOT_FOUND",
    title: "Job run not found",
    happened:
      "The requested job run, job definition or job service could not be found, or its data could not be read.",
    fix: "Check the run ID and the job name. Make sure the job's provider is configured and running for this environment.",
  },
  {
    code: "RELKIT_JOB_STREAM_GAP",
    title: "Job stream skipped items",
    happened: "The client received job stream items out of order, so some content is missing.",
    fix: "Reconnect the stream from its last received position. If gaps keep happening, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_JOB_STREAM_OVERFLOW",
    title: "Job stream exceeded its limit",
    happened:
      "A named job stream sent more frames or bytes, or a larger item, than the client allows.",
    fix: "Send smaller or fewer stream items from the job, or raise the stream limits on the client.",
  },
  {
    code: "RELKIT_JOB_STREAM_UNSUPPORTED",
    title: "Job streams are not available",
    happened:
      "The job's provider does not support named streams, or it returned an invalid stream.",
    fix: "Use a job provider that supports streams, or read the run's status and result instead of streaming.",
  },
  {
    code: "RELKIT_JOB_WATCH_ABORTED",
    title: "Job watch was interrupted",
    happened: "The connection used to watch a job run was interrupted before setup finished.",
    fix: "Start the watch again. If you aborted it on purpose, you can ignore this error.",
  },
  {
    code: "RELKIT_JOB_WATCH_DISPOSED",
    title: "Job watch was already disposed",
    happened: "Code tried to use a job watch after it was disposed.",
    fix: "Create a new watch instead of reusing one after calling `dispose`.",
  },
  {
    code: "RELKIT_JOB_WATCH_READ_TIMEOUT",
    title: "Job watch read timed out",
    happened: "Reading the next update for a watched job run took longer than the allowed time.",
    fix: "Check the network connection and that the server is running, then start the watch again.",
  },
  {
    code: "RELKIT_JOB_WATCH_UNAVAILABLE",
    title: "Job run has no ID to watch",
    happened: "A job watch was started without a usable run ID.",
    fix: "Wait until the job is submitted and has a run ID before watching it.",
  },
  {
    code: "RELKIT_MANIFEST_MIDDLEWARE_MISMATCH",
    title: "Middleware does not match the build",
    happened: "A middleware in the built manifest does not match the middleware in the app graph.",
    fix: "Run `relkit build` again so the manifest and the app match, then restart the server.",
  },
  {
    code: "RELKIT_MANIFEST_RAW_ROUTE_MISSING",
    title: "Raw route has no handler",
    happened: "A raw route listed in the built manifest has no handler function at startup.",
    fix: "Make sure the raw route exports a handler, then run `relkit build` again and restart the server.",
  },
  {
    code: "RELKIT_NATIVE_SUSPENSION",
    title: "Execution paused by the provider",
    happened:
      "The job or workflow provider paused execution so it can resume later. This is a control signal, not a failure.",
    fix: "No action is needed. If you see it as an error, make sure your code does not catch and rethrow it.",
  },
  {
    code: "RELKIT_OUTPUT_VALIDATION",
    title: "Output is invalid",
    happened: "The value a function returned did not match its output schema.",
    fix: "Check the listed validation issues and fix what the function returns, or update its output schema.",
  },
  {
    code: "RELKIT_PENDING_CAPACITY",
    title: "Too many pending job submissions",
    happened:
      "The client is already tracking 100 job submissions without a known result for the same identity.",
    fix: "Wait for pending submissions to finish before submitting more jobs from the same identity.",
  },
  {
    code: "RELKIT_PENDING_RECOVERY_UNAVAILABLE",
    title: "Pending job cannot be retried",
    happened:
      "A job submission with an unknown result cannot be retried because its retry window with the same key has closed.",
    fix: "Check whether the job was created before submitting it again with a new operation ID.",
  },
  {
    code: "RELKIT_PENDING_REQUEST_MISMATCH",
    title: "Operation ID reused with a different request",
    happened: "A tracked job operation ID was reused for a request with different input.",
    fix: "Use a new operation ID for each distinct request. Reuse an ID only to retry the exact same request.",
  },
  {
    code: "RELKIT_PROGRESS_AFTER_SETTLEMENT",
    title: "Progress sent after the function finished",
    happened: "A function reported progress after it had already returned or failed.",
    fix: "Report progress only before the function returns. Await any background work that reports progress.",
  },
  {
    code: "RELKIT_PROGRESS_TOO_LARGE",
    title: "Progress update is too large",
    happened: "A progress update was larger than the allowed encoded size.",
    fix: "Send smaller progress updates, for example a percentage or a short message instead of full data.",
  },
  {
    code: "RELKIT_PROGRESS_VALIDATION",
    title: "Progress update is invalid",
    happened: "A progress update did not match the function's progress schema.",
    fix: "Fix the progress value so it matches the schema, or update the function's progress schema.",
  },
  {
    code: "RELKIT_PROVIDER_FAILURE",
    title: "Provider operation failed",
    happened:
      "An external provider, such as a database, cache or queue, returned an error while running an operation.",
    fix: "Check the error's cause and the provider's logs. Make sure the provider is running and its connection settings are correct.",
  },
  {
    code: "RELKIT_RATE_LIMIT_STORE_UNAVAILABLE",
    title: "Rate-limit store is not usable",
    happened:
      "The cache provider used for rate limiting does not support the required counter operations, or returned an invalid count.",
    fix: "Use a cache provider that supports `get`, `increment` and `delete` for the rate-limit profile.",
  },
  {
    code: "RELKIT_RECURSION_DENIED",
    title: "Function called itself in a loop",
    happened:
      "A function call was blocked because it would call a function that is already on the call stack.",
    fix: "Check the reported cycle and break the loop, for example by moving the repeated step into a job or a separate function.",
  },
  {
    code: "RELKIT_STREAM_ALREADY_CONSUMED",
    title: "Stream was already read",
    happened: "Code tried to read a stream a second time. A RelKit stream can be read only once.",
    fix: "Read the stream once and keep the items you need, or call the function again to get a new stream.",
  },
  {
    code: "RELKIT_STREAM_CONSUMER_IDLE",
    title: "Stream was not read in time",
    happened:
      "A stream started producing items, but nothing read from it within the idle limit, so it was closed.",
    fix: "Start reading the stream as soon as you receive it, or raise the stream's idle limit.",
  },
  {
    code: "RELKIT_STREAM_FAILED",
    title: "Stream ended with an error",
    happened:
      "A server stream ended early because the application code producing it threw an error.",
    fix: "Check the server logs for the error thrown while producing the stream and fix it.",
  },
  {
    code: "RELKIT_STREAM_ITEM_ENCODING",
    title: "Stream item cannot be sent as JSON",
    happened: "A stream item could not be encoded as JSON.",
    fix: "Send only JSON values in streams. Convert dates, class instances and other values to plain data first.",
  },
  {
    code: "RELKIT_STREAM_ITEM_TOO_LARGE",
    title: "Stream item is too large",
    happened: "A stream item was larger than the configured size limit after encoding.",
    fix: "Split the data into smaller items, or raise the stream's item size limit.",
  },
  {
    code: "RELKIT_STREAM_ITEM_VALIDATION",
    title: "Stream item is invalid",
    happened: "A stream item did not match the stream's item schema.",
    fix: "Fix the item so it matches the schema, or update the stream's item schema.",
  },
  {
    code: "RELKIT_TIMEOUT",
    title: "Operation timed out",
    happened: "The operation did not finish before its time limit.",
    fix: "Find what is slow, such as a provider call or a large loop, or raise the timeout for this function.",
  },
  {
    code: "RELKIT_TOOL_ARGUMENT_VALIDATION",
    title: "Tool arguments are invalid",
    happened: "The arguments given to a tool did not match the tool's input schema.",
    fix: "Check the listed validation issues. If a model calls the tool, make the schema and its descriptions clearer.",
  },
  {
    code: "RELKIT_TOOL_NOT_ALLOWED",
    title: "Tool is not allowed here",
    happened: "A tool was called that is registered but not allowed for this agent or call.",
    fix: "Add the tool to the agent's tools, or stop the agent from calling it.",
  },
  {
    code: "RELKIT_TOOL_UNKNOWN",
    title: "Tool is not registered",
    happened: "A tool was called by an ID that is not registered in the app.",
    fix: "Check the tool ID for typos and make sure the tool is defined and included in the app, then run `relkit build` again.",
  },
  {
    code: "RELKIT_UNEXPECTED_DEFECT",
    title: "Unexpected internal error",
    happened:
      "An operation failed with an error RelKit did not expect, such as an uncaught exception.",
    fix: "Check the error's cause in the full output. If it comes from RelKit itself, report this on the RelKit issue tracker with the full output.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
