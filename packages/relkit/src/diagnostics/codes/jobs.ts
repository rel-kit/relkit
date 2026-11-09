/** Codes reported by jobs. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const jobsCodes = [
  {
    code: "RELKIT_BUCKET_CAPABILITY_UNSUPPORTED",
    title: "Bucket provider does not support this operation",
    happened:
      "Your code called a bucket operation, such as a signed read or write URL, that the selected bucket provider does not support.",
    fix: "Use a bucket provider that supports this capability, or read and write the object through the bucket client instead of a signed URL.",
  },
  {
    code: "RELKIT_BUCKET_CURSOR_INVALID",
    title: "Bucket list cursor or limit is not valid",
    happened:
      "A bucket list call received a cursor that RelKit did not issue, or a page limit that is not a positive integer.",
    fix: "Pass the cursor from the previous list result unchanged, and use a positive whole number for the limit.",
  },
  {
    code: "RELKIT_BUCKET_DEPENDENCY_UNDECLARED",
    title: "Bucket is not declared on this function",
    happened: "A function used a bucket that is not listed in its dependencies.",
    fix: "Add the bucket to the function's `dependencies`, for example `dependencies: { buckets: { assets } }`.",
  },
  {
    code: "RELKIT_BUCKET_KEY_INVALID",
    title: "Bucket key is not valid",
    happened:
      "An object key or prefix is empty, longer than 4096 bytes, absolute, contains `\\`, `.` or `..` segments, or starts with a reserved prefix such as `.relkit`.",
    fix: "Use a relative key made of non-empty segments separated by `/`, such as `avatars/123.png`.",
  },
  {
    code: "RELKIT_BUCKET_POLICY_INVALID",
    title: "Bucket object breaks the bucket policy",
    happened:
      "An object or bucket setting does not match the bucket policy. For example, the object is larger than `maxObjectBytes` or its content type is not allowed.",
    fix: "Check the message for the rule that failed, then change the object or update `maxObjectBytes`, `allowedContentTypes` or `metadata` in the bucket definition.",
  },
  {
    code: "RELKIT_BUCKET_PROVIDER_UNAVAILABLE",
    title: "Bucket provider is missing an operation",
    happened: "The configured bucket provider does not implement the operation your code called.",
    fix: "Configure a bucket provider that implements this operation, or update the provider package to a version that does.",
  },
  {
    code: "RELKIT_BUCKET_STATE_INVALID",
    title: "Local bucket storage is not usable",
    happened:
      "The local bucket provider found a problem with its storage, such as a missing or too broad root folder, a failed integrity check, or a provider that is already closed.",
    fix: "Check the message for the cause. If local files were damaged, stop the app and delete the bucket folder under `.relkit/state`. This clears local objects.",
  },
  {
    code: "RELKIT_CACHE_CAPABILITY_UNSUPPORTED",
    title: "Cache provider does not support this operation",
    happened:
      "Your code called a cache operation that the selected cache provider does not support.",
    fix: "Use a cache provider that supports this capability, or replace the call with operations it does support, such as `get` and `set`.",
  },
  {
    code: "RELKIT_CACHE_DEPENDENCY_UNDECLARED",
    title: "Cache is not declared on this function",
    happened: "A function used a cache that is not listed in its dependencies.",
    fix: "Add the cache to the function's `dependencies`, for example `dependencies: { cache: { prices } }`.",
  },
  {
    code: "RELKIT_CACHE_INCREMENT_UNSUPPORTED",
    title: "Cache increment needs a numeric value",
    happened: "Your code called `increment` on a cache whose value schema is not a number.",
    fix: "Use a cache with a numeric value schema for counters, or read, change and `set` the value instead.",
  },
  {
    code: "RELKIT_CACHE_KEY_INVALID",
    title: "Cache key is not valid JSON",
    happened:
      "A cache key, cache ID or schema version cannot be turned into plain JSON. Keys must be JSON data such as strings, numbers, arrays and plain objects.",
    fix: "Use a key built from JSON data, without `undefined`, functions, class instances or `NaN`, and give the cache a non-empty ID.",
  },
  {
    code: "RELKIT_CACHE_POLICY_INVALID",
    title: "Cache operation breaks the cache policy",
    happened:
      "A cache setting or write does not match the cache policy. For example, a TTL is above `maxTtlMs`, a value is larger than `maxBytes`, or an increment overflowed.",
    fix: "Check the message for the rule that failed, then change the value or TTL, or update the limits in the cache definition.",
  },
  {
    code: "RELKIT_CACHE_PROVIDER_UNAVAILABLE",
    title: "Cache provider is missing an operation",
    happened: "The configured cache provider does not implement the operation your code called.",
    fix: "Configure a cache provider that implements this operation, or update the provider package to a version that does.",
  },
  {
    code: "RELKIT_CACHE_SCHEMA_VALIDATION",
    title: "Cache key or value does not match its schema",
    happened: "A cache key or value failed the schema declared on the cache.",
    fix: "Check the listed issues and change the key or value to match the schema, or update the cache schema and its version.",
  },
  {
    code: "RELKIT_CACHE_STATE_INVALID",
    title: "Local cache snapshot is not usable",
    happened:
      "The local cache provider could not read or write its saved snapshot, or the snapshot data is malformed.",
    fix: "Stop the app and delete the cache folder under `.relkit/state`, then start again. This clears cached values.",
  },
  {
    code: "RELKIT_CACHE_TTL_POLICY",
    title: "Cache TTL is not valid",
    happened:
      "A cache TTL is not a positive integer, is above the configured maximum, or `defaultTtlMs` is larger than `maxTtlMs`.",
    fix: "Use a positive whole number of milliseconds for `ttlMs` that is not above `maxTtlMs`, or raise `maxTtlMs` in the cache definition.",
  },
  {
    code: "RELKIT_CACHE_VALUE_INVALID",
    title: "Cache value is not valid JSON",
    happened: "A value written to the local cache cannot be turned into plain JSON.",
    fix: "Store JSON data only, such as strings, numbers, arrays and plain objects, without `undefined`, functions, class instances or `NaN`.",
  },
  {
    code: "RELKIT_DEPENDENCY_ADAPTER_MISSING",
    title: "Integration package is not installed",
    happened: "Your project uses an integration whose RelKit adapter package is not installed.",
    fix: "Run the install command shown in the output, then try again.",
  },
  {
    code: "RELKIT_DEPENDENCY_INITIALIZATION_FAILED",
    title: "Integration package failed to start",
    happened:
      "A required package was found at a supported version, but it threw an error while loading.",
    fix: "Read the cause in the output and fix the package configuration, such as missing environment variables or credentials.",
  },
  {
    code: "RELKIT_DEPENDENCY_MISSING",
    title: "Required package is not installed",
    happened: "An integration you use needs a package that is not installed in your project.",
    fix: "Run the install command shown in the output, then try again.",
  },
  {
    code: "RELKIT_DEPENDENCY_VERSION_UNSUPPORTED",
    title: "Installed package version is not supported",
    happened:
      "An integration you use needs a package version in a range that does not include the version installed in your project.",
    fix: "Run the install command shown in the output to install a supported version.",
  },
  {
    code: "RELKIT_EARLY_TELEMETRY_OVERFLOW",
    title: "Some early telemetry was dropped",
    happened:
      "Your app produced more logs, spans or events than RelKit could hold before they were saved, so some records were dropped and the view is incomplete.",
    fix: "Reduce logging during startup or bursts of work. Records that were dropped cannot be recovered.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_ACTION_FAILED",
    title: "Event action failed",
    happened: "RelKit could not finish a local event action, such as retrying a delivery.",
    fix: "Try the action again. If it keeps failing, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_CURSOR_INVALID",
    title: "Event query cursor is not valid",
    happened: "An event query received a cursor that RelKit did not issue.",
    fix: "Pass the cursor from the previous page unchanged, or start again without a cursor.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_DELIVERY_INVALID",
    title: "Event delivery ID is not valid",
    happened: "An event action received a delivery ID that is missing or badly formed.",
    fix: "Copy the delivery ID from the event list or the Inspector and try again.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_MODE_INVALID",
    title: "Event admin mode is not valid",
    happened:
      "The local event tools were started with a mode other than development, test or production.",
    fix: "Set the mode to `development`, `test` or `production`.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_MUTATION_DISABLED",
    title: "Event changes are turned off",
    happened:
      "A local event action, such as a retry, was requested while changes are turned off, which is always the case in production mode.",
    fix: "Run the action against a development or test environment. In production, use your event provider's own tools.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_NOT_FOUND",
    title: "Event delivery was not found",
    happened: "No event delivery with this ID exists in local state.",
    fix: "Refresh the event list and check the ID. The delivery may have been removed by a reset.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_PROTOCOL_MISMATCH",
    title: "Event tools are on different versions",
    happened:
      "The tool that sent the event request uses a protocol version that the local provider does not support.",
    fix: "Update all `@relkit/*` packages and the CLI to the same version, then restart the app.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_QUERY_INVALID",
    title: "Event query is not valid",
    happened:
      "An event query has a limit that is not a positive integer, an event version below 1, or an unknown state filter.",
    fix: "Use a positive whole number for the limit and the version, and filter by `available`, `leased`, `delayed`, `completed` or `dead-lettered`.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_REQUEST_INVALID",
    title: "Event action request is not valid",
    happened: "An event action request is not an object, or its reason is empty or not text.",
    fix: "Send the request as an object, and leave out `reason` or give it non-empty text.",
  },
  {
    code: "RELKIT_EVENT_ADMIN_STATE_INELIGIBLE",
    title: "Event delivery cannot be retried",
    happened:
      "Only dead-lettered event deliveries can be retried, and this delivery is in another state.",
    fix: "Wait until the delivery is dead-lettered before retrying it, or let it finish on its own.",
  },
  {
    code: "RELKIT_EVENT_LOG_STATE_INVALID",
    title: "Local event log is damaged",
    happened: "The local event provider found a record in its saved event log that it cannot read.",
    fix: "Stop the app and delete the events folder under `.relkit/state`, then start again. This clears local events.",
  },
  {
    code: "RELKIT_EVENT_ROUTER_STATE_INVALID",
    title: "Local event delivery state is damaged",
    happened: "The local event provider found a delivery record that it cannot read.",
    fix: "Stop the app and delete the events folder under `.relkit/state`, then start again. This clears local events.",
  },
  {
    code: "RELKIT_JOBS_RUNTIME_UNBOUND",
    title: "Jobs runtime is not available here",
    happened:
      "Your code used a job control, such as waiting for a result or managing a schedule, outside a request or task that RelKit is running.",
    fix: "Call job controls from inside a function or task handler, not at module load time or from a standalone script.",
  },
  {
    code: "RELKIT_JOB_ADMIN_ACTION_FAILED",
    title: "Job action failed",
    happened: "RelKit could not finish a local job action, such as a retry or cancel.",
    fix: "Try the action again. If it keeps failing, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_JOB_ADMIN_CANCELLED",
    title: "Job was cancelled by a local action",
    happened:
      "This run stopped because someone cancelled it with a local development action, such as from the Inspector.",
    fix: "No change is needed. If the job should run, trigger it again with `relkit jobs trigger`.",
  },
  {
    code: "RELKIT_JOB_ADMIN_CURSOR_INVALID",
    title: "Job query cursor is not valid",
    happened: "A job query received a cursor that RelKit did not issue.",
    fix: "Pass the cursor from the previous page unchanged, or start again without a cursor.",
  },
  {
    code: "RELKIT_JOB_ADMIN_DEAD_LETTERED",
    title: "Job was dead-lettered by a local action",
    happened:
      "This run stopped because someone moved it to the dead-letter state with a local development action, such as from the Inspector.",
    fix: "No change is needed. If the job should run, retry it from the Inspector or with `relkit jobs retry`.",
  },
  {
    code: "RELKIT_JOB_ADMIN_INSTANCE_INVALID",
    title: "Job ID is not valid",
    happened: "A job action received a job ID that is missing or badly formed.",
    fix: "Copy the job ID from the job list or the Inspector and try again.",
  },
  {
    code: "RELKIT_JOB_ADMIN_MODE_INVALID",
    title: "Job admin mode is not valid",
    happened:
      "The local job tools were started with a mode other than development, test or production.",
    fix: "Set the mode to `development`, `test` or `production`.",
  },
  {
    code: "RELKIT_JOB_ADMIN_MUTATION_DISABLED",
    title: "Job changes are turned off",
    happened:
      "A local job action, such as a retry or cancel, was requested while changes are turned off, which is always the case in production mode.",
    fix: "Run the action against a development or test environment. In production, use `relkit jobs retry` or `relkit jobs cancel`.",
  },
  {
    code: "RELKIT_JOB_ADMIN_NOT_FOUND",
    title: "Job was not found",
    happened: "No job with this ID exists in the local queue.",
    fix: "Refresh the job list and check the ID. The job may have been removed by a reset.",
  },
  {
    code: "RELKIT_JOB_ADMIN_PROTOCOL_MISMATCH",
    title: "Job tools are on different versions",
    happened:
      "The tool that sent the job request uses a protocol version that the local provider does not support.",
    fix: "Update all `@relkit/*` packages and the CLI to the same version, then restart the app.",
  },
  {
    code: "RELKIT_JOB_ADMIN_QUERY_INVALID",
    title: "Job query is not valid",
    happened: "A job query has a limit that is not a positive integer, or an unknown state filter.",
    fix: "Use a positive whole number for the limit, and filter by `accepted`, `available`, `leased`, `delayed`, `completed` or `dead-lettered`.",
  },
  {
    code: "RELKIT_JOB_ADMIN_REQUEST_INVALID",
    title: "Job action request is not valid",
    happened: "A job action request is not an object, or its reason is empty or not text.",
    fix: "Send the request as an object, and leave out `reason` or give it non-empty text.",
  },
  {
    code: "RELKIT_JOB_ADMIN_STATE_INELIGIBLE",
    title: "Job cannot change from its current state",
    happened:
      "Only dead-lettered jobs can be retried, and completed or dead-lettered jobs cannot be cancelled or dead-lettered again.",
    fix: "Check the job's state first, then choose an action that applies to it.",
  },
  {
    code: "RELKIT_JOB_FAILURE",
    title: "Job failed with an undeclared error",
    happened:
      "The job failed with an error that is not in its declared `errors`, so RelKit shows a generic failure instead of the details.",
    fix: "Check the job's logs for the real error. To show it to callers, add that error to the job's `errors` and throw it from the handler.",
  },
  {
    code: "RELKIT_JOB_LOCATOR_INVALID",
    title: "Run ID is not valid",
    happened:
      "The run ID is badly formed, was not issued by this app, or can no longer be routed, for example after its signing key changed.",
    fix: "Use the run ID returned when the job was triggered, or find it again with `relkit jobs runs list`.",
  },
  {
    code: "RELKIT_JOB_OBSERVATION_TIMEOUT",
    title: "Reading job status timed out",
    happened:
      "RelKit asked the job provider for the run's status, but the provider did not answer in time.",
    fix: "Check that the job provider is running and reachable, then try again. Raise the timeout if the provider is slow.",
  },
  {
    code: "RELKIT_JOB_QUEUE_STATE_INVALID",
    title: "Local job queue is damaged",
    happened:
      "The local job provider found a queue entry with inconsistent data that it cannot use.",
    fix: "Stop the app and delete the jobs folder under `.relkit/state`, then start again. This clears local jobs.",
  },
  {
    code: "RELKIT_JOB_RECEIPT_INVALID",
    title: "Job provider returned an invalid confirmation",
    happened:
      "The job provider accepted a submission, but its confirmation is missing the run identity or does not match the job that was sent.",
    fix: "Update the job provider package to a version that matches your `@relkit/jobs` version. If it still fails, report this on the RelKit issue tracker.",
  },
  {
    code: "RELKIT_JOB_RESULT_UNAVAILABLE",
    title: "Job result is not available",
    happened:
      "The run has no result you can read. It may still be running, or its result expired, was redacted, or came from an incompatible job version.",
    fix: "Check the run with `relkit jobs runs get`. If it is still running, wait longer. Otherwise trigger the job again to get a new result.",
  },
  {
    code: "RELKIT_JOB_STORE_STATE_INVALID",
    title: "Local job store is not usable",
    happened: "The local job store has a record it cannot read, or it was used after it closed.",
    fix: "Restart the app. If it still fails, stop the app and delete the jobs folder under `.relkit/state`. This clears local jobs.",
  },
  {
    code: "RELKIT_JOB_SUBMISSION_CANCELLED",
    title: "Job submission was cancelled",
    happened:
      "The caller cancelled the submission before the job provider accepted it, so the job was not enqueued.",
    fix: "Submit the job again if it is still needed, and check why the request or signal was cancelled.",
  },
  {
    code: "RELKIT_JOB_SUBMISSION_FAILED",
    title: "Job submission failed",
    happened:
      "The job could not be submitted. For example, the input no longer matches the job build that was selected, or the provider rejected it.",
    fix: "Read the cause in the output. If you changed the job's input schema, rebuild and restart so callers and workers use the same build.",
  },
  {
    code: "RELKIT_LOCAL_PROVIDER_STATE_INVALID",
    title: "Local state folder is not usable",
    happened:
      "The folder RelKit uses for local provider state is empty, too broad, not a real folder, or damaged state could not be moved aside.",
    fix: "Point the state root at a project folder you own, such as the default `.relkit/state`, and check that it is a normal writable folder.",
  },
  {
    code: "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED",
    title: "Local service plan is from another version",
    happened: "The generated local service plan was written by a different RelKit version.",
    fix: "Run `relkit check` to generate the plan again.",
  },
  {
    code: "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED",
    title: "Local service state is from another version",
    happened: "The saved local service state was written by a different RelKit version.",
    fix: "Run `relkit local up` to write the state again.",
  },
  {
    code: "RELKIT_LOCAL_TASK_SLEEP",
    title: "Task paused for a durable sleep",
    happened:
      "The local job provider pauses a task during `sleep` or `sleepUntil` by throwing this marker. You see it only when your code catches it.",
    fix: "Rethrow errors you do not handle in `try`/`catch` blocks around `sleep` and `sleepUntil` so RelKit can resume the task later.",
  },
  {
    code: "RELKIT_OBSERVABILITY_QUERY_INVALID",
    title: "Observability query is not valid",
    happened:
      "A query for logs, spans or events has a field RelKit cannot use, such as an unknown order, a bad cursor or a limit out of range.",
    fix: "Check the message for the field that failed and correct it. Pass cursors unchanged from the previous page.",
  },
  {
    code: "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
    title: "Observability query is from another version",
    happened:
      "The tool that sent the query uses a query protocol or version that this RelKit version does not support.",
    fix: "Update all `@relkit/*` packages and the CLI to the same version, then restart the app.",
  },
  {
    code: "RELKIT_OBSERVABILITY_STREAM_CLOSED",
    title: "Observability stream is closed",
    happened: "Your code read from a live observability stream after it was closed.",
    fix: "Open the stream again before reading.",
  },
  {
    code: "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED",
    title: "Stream cursor is too old",
    happened: "The stream cursor points to records that RelKit no longer keeps.",
    fix: "Reconnect without a cursor to follow new records, and query past records separately if you need them.",
  },
  {
    code: "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE",
    title: "Stream cursor is ahead of the stream",
    happened:
      "The stream cursor is newer than any record RelKit has, often because it came from an earlier run of the app.",
    fix: "Reconnect without a cursor to follow the stream from now.",
  },
  {
    code: "RELKIT_OBSERVABILITY_STREAM_INVALID",
    title: "Observability stream request is not valid",
    happened:
      "A live stream request has a bad cursor, conflicting cursors or a size limit out of range.",
    fix: "Check the message for the field that failed. Send one cursor taken unchanged from the stream, and use positive limits.",
  },
  {
    code: "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED",
    title: "Provider override state is from another version",
    happened: "The saved provider override state was written by a different RelKit version.",
    fix: "Run `relkit local up` to write the state again.",
  },
  {
    code: "RELKIT_TASK_BLOCKING_WAIT_UNSUPPORTED",
    title: "Task cannot wait for another task's result",
    happened:
      "A task handler tried to wait for another job's result, which could block a worker indefinitely.",
    fix: "Trigger the other job and finish this task, then handle its result in a follow-up job or event instead of waiting.",
  },
  {
    code: "RELKIT_TASK_EMISSION_ABORTED",
    title: "Task progress update was cancelled",
    happened:
      "A task tried to emit progress or a stream item after its run was cancelled or stopped.",
    fix: "Check the task's abort signal before emitting, and stop work once the run is cancelled.",
  },
  {
    code: "RELKIT_TASK_FAILED",
    title: "Task failed with a non-error value",
    happened:
      "A task handler threw something that is not an `Error`, so RelKit has no error name or message to report.",
    fix: "Throw an `Error` or one of the task's declared errors instead of a string or other value.",
  },
  {
    code: "RELKIT_TASK_INPUT_INVALID",
    title: "Task input does not match its schema",
    happened: "The task input failed the task's input schema or cannot be turned into plain JSON.",
    fix: "Check the listed issues and change the input to match the schema, using JSON data only.",
  },
  {
    code: "RELKIT_TASK_INPUT_TOO_LARGE",
    title: "Task input is too large",
    happened: "The task input is larger than its byte limit, which is 1 MiB of JSON by default.",
    fix: "Send a smaller input, such as an ID, and keep large data in your own storage or a bucket.",
  },
  {
    code: "RELKIT_TASK_INPUT_WIRE_NON_IDENTITY",
    title: "Task `inputWire` changes the input",
    happened:
      "The task's `inputWire` schema changed saved input when it validated it, so the stored JSON would no longer match what was sent.",
    fix: "Make `inputWire` validate without transforming values, or remove it so the input schema is used.",
  },
  {
    code: "RELKIT_TASK_OUTPUT_INVALID",
    title: "Task output does not match its schema",
    happened:
      "The value returned by the task handler failed the task's output schema or cannot be turned into plain JSON.",
    fix: "Check the listed issues and return a value that matches the output schema, using JSON data only.",
  },
  {
    code: "RELKIT_TASK_OUTPUT_TOO_LARGE",
    title: "Task output is too large",
    happened: "The task output is larger than its byte limit, which is 1 MiB of JSON by default.",
    fix: "Return a smaller output, such as an ID, and keep large data in your own storage or a bucket.",
  },
  {
    code: "RELKIT_TASK_PROGRESS_INVALID",
    title: "Progress update does not match its schema",
    happened:
      "A task emitted a progress value that failed the progress schema or cannot be turned into plain JSON.",
    fix: "Check the message and send progress values that match the task's progress schema, using JSON data only.",
  },
  {
    code: "RELKIT_TASK_PROGRESS_PERSISTENCE",
    title: "Progress update was not saved",
    happened:
      "The task needs progress to be saved, but no store is configured or the store did not save the update.",
    fix: "Configure a jobs provider that saves progress, or check the provider's logs for the write error.",
  },
  {
    code: "RELKIT_TASK_PROGRESS_RETENTION",
    title: "Progress update belongs to an old attempt",
    happened:
      "The provider saved a progress update for a different attempt of this run than the one now running.",
    fix: "Make sure only the current attempt emits progress. If the provider is custom, return the attempt's generation with each saved update.",
  },
  {
    code: "RELKIT_TASK_PROGRESS_TOO_LARGE",
    title: "Progress update is too large",
    happened:
      "A task emitted a progress value larger than its byte limit, so RelKit did not store it.",
    fix: "Send a smaller progress value, such as counts or an ID, and keep large data in your own storage.",
  },
  {
    code: "RELKIT_TASK_STREAM_INVALID",
    title: "Stream item or name is not valid",
    happened:
      "A task stream has an invalid name, or an emitted item failed the stream schema or cannot be turned into plain JSON.",
    fix: "Check the message, give the stream a camelCase name such as `rowsProcessed`, and send items that match the stream schema.",
  },
  {
    code: "RELKIT_TASK_STREAM_PERSISTENCE",
    title: "Stream item was not saved",
    happened:
      "The task needs stream items to be saved, but no store is configured or the store did not save the item.",
    fix: "Configure a jobs provider that saves stream items, or check the provider's logs for the write error.",
  },
  {
    code: "RELKIT_TASK_STREAM_RETENTION",
    title: "Stream item belongs to an old attempt",
    happened:
      "The provider saved a stream item for a different attempt of this run than the one now running.",
    fix: "Make sure only the current attempt emits stream items. If the provider is custom, return the attempt's generation with each saved item.",
  },
  {
    code: "RELKIT_TASK_STREAM_TOO_LARGE",
    title: "Stream item is too large",
    happened:
      "A task emitted a stream item larger than its byte limit, so RelKit did not store it.",
    fix: "Send smaller items, such as counts or IDs, and keep large data in your own storage.",
  },
  {
    code: "RELKIT_TASK_WIRE_INVALID",
    title: "Job data is not in a supported format",
    happened:
      "Stored or received job data is badly formed, too large, or uses a format version this RelKit version does not support.",
    fix: "Update all `@relkit/*` packages so the sender and worker use the same version. If it still fails, report this on the RelKit issue tracker.",
  },
  {
    code: "RELKIT_TELEMETRY_EXPORTER_FAILED",
    title: "Telemetry exporter failed",
    happened:
      "A telemetry exporter threw an error while sending, flushing or closing, so some logs, spans or metrics may not have reached it.",
    fix: "Check the exporter's endpoint, credentials and network access. Your app keeps running, and other exporters are not affected.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
