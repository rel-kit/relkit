/** Codes reported by compiler. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const compilerCodes = [
  {
    code: "RELKIT_AGENT_CONTROL_INVALID",
    title: "Agent is missing the approve control",
    happened:
      "An agent exposed to clients uses a tool that needs approval, but the agent does not declare the `approve` control.",
    fix: 'Add `"approve"` to the agent\'s client controls, or set the tool\'s `approval` to `"never"` if it does not need approval.',
  },
  {
    code: "RELKIT_AGENT_TOOL_INVALID",
    title: "Agent tool is invalid",
    happened:
      "An agent's `tools` option is not an array, or one of its entries does not point to a tool defined in your app.",
    fix: "Pass `tools` as an array of tools made with `defineTool`, and check that each one is exported from a file under `src/`.",
  },
  {
    code: "RELKIT_APP_CONFIG_ALIAS",
    title: "App sets both jobs and job",
    happened:
      "`defineApp` sets both `jobs` and the older `job` option, or both `defaults.jobs` and `defaults.job`, so RelKit cannot tell which one to use.",
    fix: "Keep `jobs` (or `defaults.jobs`) and remove the singular `job` option.",
  },
  {
    code: "RELKIT_APP_DUPLICATE",
    title: "More than one app config is exported",
    happened:
      "Your project exports more than one `defineApp` config. A RelKit app has exactly one.",
    fix: "Keep a single `defineApp` export in `relkit.config.ts` and remove the others.",
  },
  {
    code: "RELKIT_APP_LEGACY_JOB_ALIAS",
    title: "Singular job option is deprecated",
    happened:
      "`defineApp` uses the singular `job` or `defaults.job` option. It still works for now but will be removed.",
    fix: "Rename `job` to `jobs` and `defaults.job` to `defaults.jobs` in `defineApp`.",
  },
  {
    code: "RELKIT_AUTH_DUPLICATE",
    title: "Better Auth is set up more than once",
    happened:
      "The app registers more than one Better Auth service, or the Better Auth service is mounted on no route or on several routes.",
    fix: "Keep one `defineBetterAuthService` and mount it on exactly one `ALL` catch-all route, then run `relkit check`.",
  },
  {
    code: "RELKIT_BOUNDARY_ANALYSIS_LIMIT",
    title: "Dynamic import cannot be checked",
    happened:
      "A dynamic `import()` uses a path RelKit cannot read ahead of time, so it cannot confirm the import stays within domain boundaries.",
    fix: "Use a string literal path in the `import()` call, or import through the other domain's public service.",
  },
  {
    code: "RELKIT_BUCKET_PROFILE_DUPLICATE",
    title: "Bucket profile is used twice",
    happened:
      "Two buckets claim the same bucket profile. Each profile can belong to only one bucket.",
    fix: "Give one of the buckets a different profile, then run `relkit check`.",
  },
  {
    code: "RELKIT_CONFIG_APPLICATION_BEHAVIOR",
    title: "Tooling config has an invalid value",
    happened:
      "A setting in `relkit.config.ts` has the wrong type, or the tooling config holds functions, getters or other code where only plain data is allowed.",
    fix: "Use plain values (strings, numbers, booleans, arrays and objects) for the setting named in the error, and keep app logic in `src/`.",
  },
  {
    code: "RELKIT_CONFIG_EXCLUDE_INVALID",
    title: "Exclude setting is invalid",
    happened:
      "The `exclude` setting in `relkit.config.ts` is not valid. RelKit already skips tests, fixtures, type declarations and generated files.",
    fix: "Remove `exclude` from `relkit.config.ts`.",
  },
  {
    code: "RELKIT_CONFIG_INSPECTOR_INVALID",
    title: "Inspector settings are invalid",
    happened:
      "The `inspector` settings in `relkit.config.ts` are not valid, or they use the older `inspector.port` setting.",
    fix: "Use `enabled`, `connection.host`, `connection.port` and `maxPreviewBytes`. Replace `inspector.port` with `inspector.connection.port`, and set the UI port with `relkit-inspector --port`.",
  },
  {
    code: "RELKIT_CONFIG_KEY_NOT_ALLOWED",
    title: "Unknown tooling config setting",
    happened:
      "`relkit.config.ts` has a setting RelKit does not recognize, at the top level or inside `server`, `inspector` or `deployment`.",
    fix: "Remove or rename the setting named in the error, checking for typos.",
  },
  {
    code: "RELKIT_CONFIG_LEGACY_KEY",
    title: "Tooling config uses a removed setting",
    happened:
      "`relkit.config.ts` uses `entry`, `source`, `exclude` or `generatedDirectory`. RelKit now reads `src/**/*.ts` and writes to `.relkit/generated` by convention.",
    fix: "Remove the setting named in the error from `relkit.config.ts`.",
  },
  {
    code: "RELKIT_CONFIG_PATH_INVALID",
    title: "Config path is invalid",
    happened: "A path in `relkit.config.ts` is empty or is not a valid relative path.",
    fix: "Use a relative path inside your project, written with forward slashes.",
  },
  {
    code: "RELKIT_CONFIG_PATH_OUTSIDE_ROOT",
    title: "Config path points outside the project",
    happened: "A path in `relkit.config.ts` resolves to a location outside the project folder.",
    fix: "Change the path so it stays inside the folder that contains `relkit.config.ts`.",
  },
  {
    code: "RELKIT_CONFIG_PORT_INVALID",
    title: "Port is out of range",
    happened: "A port in `relkit.config.ts` is not a whole number from 1 through 65535.",
    fix: "Set the port named in the error to a whole number from 1 through 65535.",
  },
  {
    code: "RELKIT_CONFIG_ROOT_INVALID",
    title: "Project folder or config is invalid",
    happened:
      "RelKit could not use the project folder, or `relkit.config.ts` does not export a plain object.",
    fix: "Run the command from your project folder and make sure `relkit.config.ts` default-exports a plain object.",
  },
  {
    code: "RELKIT_CONFIG_SOURCE_INVALID",
    title: "Source setting is invalid",
    happened:
      "The `source` setting in `relkit.config.ts` is not valid. RelKit always reads your code from `src/**/*.ts`.",
    fix: "Remove `source` from `relkit.config.ts` and keep your app code under `src/`.",
  },
  {
    code: "RELKIT_CONVENTION_DIRECTORY",
    title: "Definition is outside its usual folder",
    happened:
      "A definition lives outside the folder RelKit recommends for its kind, such as `functions/` or `jobs/`. It still works, but it is harder to find.",
    fix: "Move the file into the folder shown in the warning.",
  },
  {
    code: "RELKIT_CONVENTION_EXPORT",
    title: "Definition file has no default export",
    happened:
      "A definition file does not default-export its definition. RelKit recommends one default export per file so each file has a clear entry.",
    fix: "Add `export default` for the definition named in the warning.",
  },
  {
    code: "RELKIT_CONVENTION_ID_STYLE",
    title: "ID does not use the recommended style",
    happened:
      "A definition ID is not lower case with parts separated by dots or hyphens, such as `orders.create`.",
    fix: "Rename the ID to lower-case letters and numbers separated by dots or hyphens.",
  },
  {
    code: "RELKIT_CONVENTION_MULTIPLE_KINDS",
    title: "File defines several kinds of things",
    happened: "One file contains definitions of different kinds, for example a function and a job.",
    fix: "Move each kind of definition into its own file.",
  },
  {
    code: "RELKIT_CONVENTION_SUFFIX",
    title: "File name lacks the recommended suffix",
    happened:
      "A definition file does not end with the suffix RelKit recommends for its kind, such as `.function.ts` or `.job.ts`.",
    fix: "Rename the file to use the suffix shown in the warning.",
  },
  {
    code: "RELKIT_DESCRIPTOR_INVALID",
    title: "Definition is invalid",
    happened:
      "An exported value is not a RelKit definition, or a definition has an option that is not allowed, such as an event version that is not a positive whole number.",
    fix: "Fix the definition named in the error, or stop exporting values that are not RelKit definitions from that file.",
  },
  {
    code: "RELKIT_DOMAIN_BOUNDARY",
    title: "Import crosses a domain boundary",
    happened:
      "A file imports code from inside another domain instead of going through its public service.",
    fix: "Import what you need from the other domain's public service, or move the shared code to a place both domains can use.",
  },
  {
    code: "RELKIT_DOMAIN_INVALID",
    title: "Domain is set up incorrectly",
    happened:
      "A domain has more than one service, no definitions, members from another domain, or an unsupported database or Better Auth setup.",
    fix: "Follow the message to fix the domain: one service per domain, members from that domain only, and exactly one Drizzle service when you use Better Auth.",
  },
  {
    code: "RELKIT_DUPLICATE_ID",
    title: "ID is used twice",
    happened: "Two definitions in the app have the same ID, so RelKit cannot tell them apart.",
    fix: "Rename one of them, or give it an explicit `id` if the ID was taken from the file or export name.",
  },
  {
    code: "RELKIT_EVALUATOR_IMPORT_FAILED",
    title: "A source file failed to load",
    happened:
      "RelKit imports your source files to find definitions, and one of them threw an error while loading.",
    fix: "Fix the error shown with the file name, often a bad import or code that runs at the top of the module, then run `relkit check` again.",
  },
  {
    code: "RELKIT_EVALUATOR_PROCESS_FAILED",
    title: "Could not start the file loader",
    happened: "RelKit could not start the separate process it uses to load your source files.",
    fix: "Run `relkit doctor` to check that Bun is installed and works in this folder, then try again.",
  },
  {
    code: "RELKIT_EVALUATOR_PROTOCOL_INVALID",
    title: "File loader returned an unreadable result",
    happened:
      "The process that loads your source files exited without a valid result. Calling `process.exit` or writing to stdout at import time can cause this.",
    fix: "Remove top-level `process.exit` calls and stdout writes from your source files. If it persists, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_EVALUATOR_REQUEST_INVALID",
    title: "File loader received an invalid request",
    happened: "RelKit sent an invalid request to the process that loads your source files.",
    fix: "Report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_EVALUATOR_ROOT_INVALID",
    title: "File loader ran in the wrong folder",
    happened:
      "The process that loads your source files started in a different folder than your project.",
    fix: "Run the command from your project folder. If it keeps happening, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_EVALUATOR_SIDE_EFFECT",
    title: "Source file does work when imported",
    happened:
      "Importing a source file started a server, timer, child process or network call, wrote files, or printed output. RelKit loads files only to read definitions.",
    fix: "Move that work into a handler or function that runs on request, so importing the file has no side effects.",
  },
  {
    code: "RELKIT_EVALUATOR_TIMEOUT",
    title: "Loading source files timed out",
    happened:
      "Loading your source files took too long, so RelKit stopped. A slow or endless top-level `await` is a common cause.",
    fix: "Remove long-running work, such as awaiting a network call, from the top level of your modules, then run `relkit check` again.",
  },
  {
    code: "RELKIT_EVENT_FUNCTION_OPTION_INVALID",
    title: "Event function sets an unsupported option",
    happened:
      "An event function declares an option it cannot have. Its input always comes from the event, and it returns nothing on success.",
    fix: "Remove the option named in the error from `defineEventFunction`.",
  },
  {
    code: "RELKIT_EVENT_FUNCTION_RESULT_INVALID",
    title: "Event function returns a value",
    happened:
      "An event function's handler returns a value on success. Event functions must return nothing.",
    fix: "Return `void` from the handler on success, and use declared errors for failures.",
  },
  {
    code: "RELKIT_EVENT_FUNCTION_TARGET_INVALID",
    title: "Event function is called directly",
    happened:
      "Code calls an event-only function directly, or a route, job or tool targets it. Event functions run only when their event is published.",
    fix: "Publish the event instead, or target a regular function made with `defineFunction`.",
  },
  {
    code: "RELKIT_EVENT_MATERIALIZATION_INVALID",
    title: "Events could not be set up at startup",
    happened:
      "When the app started, an event trigger or event was registered twice, pointed at an unknown function, or had no event provider configured.",
    fix: "Run `relkit check` to find the event problem, check the events provider in your app config, then rebuild with `relkit build`.",
  },
  {
    code: "RELKIT_EVENT_NAME_UNKNOWN",
    title: "Event is not defined",
    happened: "An event function or trigger refers to an event that is not defined in your app.",
    fix: "Define the event with `defineEvent`, or fix the name so it matches an event that exists.",
  },
  {
    code: "RELKIT_EVENT_TARGET_INCOMPATIBLE",
    title: "Event trigger targets a regular function",
    happened: "An event trigger points at a function that is not an event function.",
    fix: "Point the trigger at a function made with `defineEventFunction`.",
  },
  {
    code: "RELKIT_EVENT_TRIGGER_ID_COLLISION",
    title: "Event trigger ID is already taken",
    happened:
      "An event function needs a trigger ID to receive its event, but another definition in your app already uses that ID.",
    fix: "Rename the other definition that uses the ID shown in the error.",
  },
  {
    code: "RELKIT_GRAPH_FUNCTION_DUPLICATE",
    title: "Function ID is used twice",
    happened: "Two functions in the app have the same ID, so RelKit cannot tell which one to call.",
    fix: "Rename one of the functions or move it to another service so every function ID is unique, then run `relkit check`.",
  },
  {
    code: "RELKIT_GRAPH_ID_COLLISION",
    title: "Two parts of the app share an ID",
    happened:
      "Two different kinds of things in your app, such as a function and a job, end up with the same ID.",
    fix: "Rename one of them so every ID in the app is unique, then run `relkit check`.",
  },
  {
    code: "RELKIT_GRAPH_MANIFEST_MISMATCH",
    title: "Build files are out of sync",
    happened:
      "The generated manifest does not match the app graph it was built with, usually because some build files come from an older build.",
    fix: "Run `relkit build` again and deploy all of its output together.",
  },
  {
    code: "RELKIT_IDEMPOTENCY_INVALID",
    title: "Idempotency settings are invalid",
    happened:
      "The `idempotency` option is not an object, has no `key`, or has a `retentionMs` that is not a positive number.",
    fix: "Set `idempotency` to an object with a non-empty `key` and a positive `retentionMs`.",
  },
  {
    code: "RELKIT_ERROR_ID_REQUIRED",
    title: "Error has no ID",
    happened:
      "A `defineError` call has no `id`. An error's ID is the public `code` in API responses, so it must not change when the file moves.",
    fix: "Add the `id` the message suggests; it is the ID earlier versions inferred, so clients see the same code.",
  },
  {
    code: "RELKIT_ID_INFERENCE_AMBIGUOUS",
    title: "ID cannot be worked out from the source",
    happened:
      "RelKit could not take a stable ID from how this definition is exported or assigned, for example when it is built inside a loop or function.",
    fix: "Give the definition an explicit `id`, or export it as a named constant or default export.",
  },
  {
    code: "RELKIT_ID_INVALID",
    title: "ID is not valid",
    happened:
      "A definition ID is not a valid stable ID, or an ID inside a domain does not start with the domain name.",
    fix: "Use letters and numbers joined by dots, hyphens or underscores. Inside a domain, start IDs with the domain name and give the service the same ID as the domain.",
  },
  {
    code: "RELKIT_JOBS_MANIFEST_GRAPH_MISMATCH",
    title: "Jobs build files are out of sync",
    happened: "The generated jobs manifest does not match the app graph from the same build.",
    fix: "Run `relkit build` again and deploy all of its output together.",
  },
  {
    code: "RELKIT_JOBS_MANIFEST_INVALID",
    title: "Jobs manifest is invalid",
    happened: "The generated jobs manifest is missing information or could not be read.",
    fix: "Run `relkit build` again. If the error persists, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_JOB_BINDING_INVALID",
    title: "Task has unclear job bindings",
    happened:
      "A task has more than one default job, or RelKit cannot create a job for it automatically because its export name is not unique.",
    fix: "Mark at most one job per task as `default`, or define the job for the task explicitly with `defineJob` and a unique `name`.",
  },
  {
    code: "RELKIT_JOB_CAPABILITY_UNSUPPORTED",
    title: "Jobs service lacks a needed feature",
    happened:
      "A task needs a feature, such as schedules or resources, that the selected jobs service does not offer.",
    fix: "Choose a jobs service that supports the feature named in the error, or remove that requirement from the task.",
  },
  {
    code: "RELKIT_JOB_INPUT_INCOMPATIBLE",
    title: "Job input does not match its target",
    happened: "A job's input schema does not fit the input of the function or task it runs.",
    fix: "Change the job input so it matches the target's input schema, then run `relkit check`.",
  },
  {
    code: "RELKIT_JOB_MATERIALIZATION_INVALID",
    title: "Jobs could not be set up at startup",
    happened:
      "When the app started, a job, queue or schedule pointed at something unknown, was registered twice, or had no queue or scheduler provider.",
    fix: "Run `relkit check` to find the job problem, check the jobs provider in your app config, then rebuild with `relkit build`.",
  },
  {
    code: "RELKIT_JOB_NAME_INVALID",
    title: "Job name is invalid or taken",
    happened: "A job's name is not valid, or another job already uses it.",
    fix: "Give the job a unique camelCase name that starts with a lower-case letter and uses only letters and numbers, such as `sendWelcomeEmail`.",
  },
  {
    code: "RELKIT_JOB_OPERATION_EXPOSURE_INVALID",
    title: "Job client settings are invalid",
    happened:
      "A job's `client` option is not an object, lists no operations, or names an operation or field that is not supported.",
    fix: "Set `client.operations` to a non-empty list of supported operations and use only supported `client.fields`.",
  },
  {
    code: "RELKIT_JOB_PROFILE_DEPRECATED",
    title: "Job profile option is deprecated",
    happened:
      "A job uses the `profile` option, which has been renamed to `service`. Setting both is an error.",
    fix: "Rename `profile` to `service` in `defineJob`.",
  },
  {
    code: "RELKIT_JOB_REPLAY_ADVISORY",
    title: "Task may not resume safely after a retry",
    happened:
      "A task does outside work before a durable wait, or uses a wait key that can change between runs, so a retry may repeat work or lose its place.",
    fix: "Derive wait keys from the task input or a versioned constant, and guard outside work with an idempotency key.",
  },
  {
    code: "RELKIT_JOB_RESOURCES_UNSUPPORTED",
    title: "Task resources are invalid",
    happened: "A task's `resources` option does not set positive CPU and memory values.",
    fix: "Set positive CPU and memory values in the task's `resources`, or remove the option.",
  },
  {
    code: "RELKIT_JOB_SCHEDULE_INVALID",
    title: "Job schedule is invalid",
    happened:
      "A job's `schedules` option is not an array, repeats a schedule ID, or has a schedule without a valid `cron` or `every` value.",
    fix: "Give each schedule a unique `id` and a valid `cron` or `every` value.",
  },
  {
    code: "RELKIT_JOB_SCHEMA_PROJECTION_UNSAFE",
    title: "Job or task schema cannot be stored safely",
    happened:
      "A job overrides its task's input or output schema, or a task's input schema transforms data, so RelKit cannot store job input faithfully.",
    fix: "Remove input and output overrides from the job. If the task input transforms data, add an `inputWire` schema that keeps values unchanged.",
  },
  {
    code: "RELKIT_JOB_TASK_INVALID",
    title: "Job does not point at a task",
    happened: "A job targets a function or something other than a task. New jobs must run a task.",
    fix: "Set the job's `task` to a task made with `defineTask` and remove `target`.",
  },
  {
    code: "RELKIT_JOB_VERSION_INCOMPATIBLE",
    title: "Job and task versions do not match",
    happened:
      "A task has no version, a job pins a task version that differs from the task, or a job's `buildId` is empty.",
    fix: "Give the task a non-empty `version` and make the job use the same version. Remove an empty `buildId`.",
  },
  {
    code: "RELKIT_JOB_WORKER_IMMUTABLE_CONFLICT",
    title: "Job worker file already exists with different content",
    happened:
      "A built job worker for this task version already exists with different code. Worker files for a version never change once written.",
    fix: "Change the task `version` (or the job `buildId`) when you change its code, or delete the old `.relkit/build` folder if you are only rebuilding locally.",
  },
  {
    code: "RELKIT_MANIFEST_GENERATOR_UNSUPPORTED",
    title: "Build was made by another RelKit version",
    happened:
      "The runtime manifest was generated by a different version of RelKit than the one running the app.",
    fix: "Run `relkit build` with the same RelKit version you run in production, then deploy the new output.",
  },
  {
    code: "RELKIT_MANIFEST_HANDLER_DUPLICATE",
    title: "Function is registered twice in the build",
    happened: "The runtime manifest registers the same function more than once.",
    fix: "Run `relkit build` again. If the error persists, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_MANIFEST_HANDLER_EXTRA",
    title: "Build registers an unknown function",
    happened:
      "The runtime manifest registers a function that is not in the app graph, usually because build files are from different builds.",
    fix: "Run `relkit build` again and deploy all of its output together.",
  },
  {
    code: "RELKIT_MANIFEST_HANDLER_INVALID",
    title: "Build has an invalid function entry",
    happened: "An entry in the runtime manifest does not have a valid function ID and handler.",
    fix: "Run `relkit build` again. If the error persists, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_MANIFEST_HANDLER_MISSING",
    title: "Function has no handler in the build",
    happened:
      "A function in the app graph has no handler RelKit can call, either while building or in the built manifest.",
    fix: "Make sure the function has a `handler` and is exported from its file, then run `relkit build` again.",
  },
  {
    code: "RELKIT_MANIFEST_MIDDLEWARE_MISSING",
    title: "Middleware is missing from the build",
    happened:
      "A middleware in the app graph has no code RelKit can run, or it is missing from the built manifest.",
    fix: "Make sure the middleware is exported from its file, then run `relkit build` again and deploy all of its output.",
  },
  {
    code: "RELKIT_MANIFEST_TRANSFORM_MISSING",
    title: "Request transform is missing from the build",
    happened:
      "A request transform in the app graph has no code RelKit can run, or it is missing from the built manifest.",
    fix: "Make sure the transform is exported from its file, then run `relkit build` again and deploy all of its output.",
  },
  {
    code: "RELKIT_MANIFEST_VERSION_UNSUPPORTED",
    title: "Build format is not supported",
    happened: "The runtime manifest uses a format version this RelKit runtime does not support.",
    fix: "Run `relkit build` with the same RelKit version you run in production, then deploy the new output.",
  },
  {
    code: "RELKIT_MAPPING_INCOMPATIBLE",
    title: "Route request does not match the function input",
    happened:
      "A route's request mapping, or a path parameter it reads, does not fit the input schema of the function it calls.",
    fix: "Add the missing field to the function's input schema, or define an explicit request mapping on the route.",
  },
  {
    code: "RELKIT_METHOD_INVALID",
    title: "HTTP method is invalid",
    happened: "A route uses an HTTP method RelKit does not support.",
    fix: "Use GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS.",
  },
  {
    code: "RELKIT_MIDDLEWARE_INPUT_INCOMPATIBLE",
    title: "Middleware input does not match the route",
    happened: "A middleware expects input that the route it runs on does not provide.",
    fix: "Change the middleware's input schema or the route so they match, then run `relkit check`.",
  },
  {
    code: "RELKIT_MIDDLEWARE_OUTPUT_INCOMPATIBLE",
    title: "Middleware output does not match the route",
    happened: "A middleware returns output that the route or its function cannot accept.",
    fix: "Change the middleware's output schema or the route so they match, then run `relkit check`.",
  },
  {
    code: "RELKIT_MISSING_MIDDLEWARE",
    title: "Middleware is not defined",
    happened: "A route refers to a middleware that is not defined in your app.",
    fix: "Define the middleware with `defineMiddleware`, or fix the reference so it points at one that exists.",
  },
  {
    code: "RELKIT_MISSING_TARGET",
    title: "Reference does not point at anything",
    happened:
      "A route, job, tool, agent or service member refers to a function, bucket or other definition that does not exist in your app.",
    fix: "Fix the reference named in the error, or define and export the thing it points at.",
  },
  {
    code: "RELKIT_MISSING_TRANSFORM",
    title: "Request transform is not found",
    happened:
      "A route uses a request transform RelKit cannot find, or a named transform is never used.",
    fix: "Define the transform with `defineRequestTransform` and reference it from a route, or remove the unused transform.",
  },
  {
    code: "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID",
    title: "Model provider settings are invalid",
    happened:
      "The model provider settings in your app config are missing a value or have the wrong shape.",
    fix: "Set a default provider and default model, and list each provider you use in the app's model settings.",
  },
  {
    code: "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING",
    title: "Model provider has no default model",
    happened:
      "A model selector names only a provider, and that provider has no default model configured.",
    fix: 'Use a full selector such as `"openai:gpt-4o"`, or set a default model for that provider.',
  },
  {
    code: "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID",
    title: "Model provider environment is not set up",
    happened: "A model provider is missing an API key or other environment variable it needs.",
    fix: "Set the environment variables the provider needs, for example with `relkit env`, then restart the app.",
  },
  {
    code: "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE",
    title: "Model is not available",
    happened:
      "An agent uses a model that its provider does not offer or does not support for this use.",
    fix: "Pick a model the provider offers with the features your agent needs, then restart the app.",
  },
  {
    code: "RELKIT_MODEL_PROVIDER_REGISTRY_INVALID",
    title: "Agent has no active model provider",
    happened: "An agent uses a model profile that has no model provider running.",
    fix: "Configure a model provider for the agent's profile in your app config, then restart the app.",
  },
  {
    code: "RELKIT_MODEL_PROVIDER_UNKNOWN",
    title: "Model provider is not configured",
    happened: "A model selector names a provider that is not configured in your app.",
    fix: "Add the provider to your app's model settings, or change the selector to a configured provider.",
  },
  {
    code: "RELKIT_MODEL_PROVIDER_UNSUPPORTED",
    title: "Model provider is not supported",
    happened: "The configured model provider is not supported by the installed RelKit integration.",
    fix: "Use a supported model provider, or install the integration package that supports it.",
  },
  {
    code: "RELKIT_MODEL_SELECTOR_INVALID",
    title: "Model selector is invalid",
    happened: "An agent's `model` value is not a valid model selector.",
    fix: 'Use a selector in the form `"provider:model"`, or a provider name that has a default model.',
  },
  {
    code: "RELKIT_NORMALIZATION_FAILED",
    title: "Checking the app failed unexpectedly",
    happened: "RelKit hit an unexpected error while checking your app's definitions.",
    fix: "Report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_PATH_INVALID",
    title: "Route or middleware path is invalid",
    happened: "A route or middleware has a path RelKit cannot use.",
    fix: "Start the path with `/` and use only valid path segments and parameters.",
  },
  {
    code: "RELKIT_PROFILE_INVALID",
    title: "Profile name is invalid",
    happened: "A `profile` or `service` value is not a valid profile ID.",
    fix: "Use a profile ID made of letters and numbers, optionally joined by dots, hyphens or underscores, that matches a profile in your app config.",
  },
  {
    code: "RELKIT_PROVIDER_ABORTED",
    title: "Provider startup was cancelled",
    happened: "The app was stopped while its providers were still starting.",
    fix: "Start the app again. If it keeps stopping, check the logs for what ended the process.",
  },
  {
    code: "RELKIT_PROVIDER_CONFIGURATION_INVALID",
    title: "Provider connection settings are invalid",
    happened: "RelKit could not work out the connection settings for one of the app's providers.",
    fix: "Check the provider's connection settings and environment variables, then restart the app.",
  },
  {
    code: "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
    title: "Provider failed to start",
    happened: "One of the app's providers threw an error or returned nothing while starting.",
    fix: "Check the provider's settings and that the service it connects to is reachable, then restart the app.",
  },
  {
    code: "RELKIT_PROVIDER_INTEGRATION_INVALID",
    title: "Provider integration is invalid",
    happened:
      "An installed provider integration package registered itself in a way RelKit cannot use.",
    fix: "Update or reinstall the integration package, then run `relkit build` again.",
  },
  {
    code: "RELKIT_PROVIDER_INTEGRATION_MISSING",
    title: "No integration for a provider",
    happened: "The app needs a provider that no installed integration package can create.",
    fix: "Install the integration package for the provider named in the error, then run `relkit build` again.",
  },
  {
    code: "RELKIT_PROVIDER_METADATA_INVALID",
    title: "Provider details in the build are invalid",
    happened: "The provider details in the build are missing or do not match the app graph.",
    fix: "Run `relkit build` again and deploy all of its output together.",
  },
  {
    code: "RELKIT_PROVIDER_PROFILE_UNKNOWN",
    title: "Provider profile is not available",
    happened:
      "Code uses a provider profile that does not exist or does not offer the needed feature, or several profiles exist and none is the default.",
    fix: "Name an existing profile that offers the feature, or mark one profile as the default.",
  },
  {
    code: "RELKIT_PROVIDER_READINESS_FAILED",
    title: "Provider health check failed",
    happened: "A provider started but failed its health check, so the app did not start serving.",
    fix: "Check that the service the provider connects to is running and reachable, then restart the app.",
  },
  {
    code: "RELKIT_PROVIDER_RELEASE_FAILED",
    title: "Provider failed to shut down",
    happened: "One or more providers threw an error while the app was shutting down.",
    fix: "Check the logs for the provider that failed. Open connections may need to be closed by the service itself.",
  },
  {
    code: "RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED",
    title: "Provider works only locally",
    happened:
      "A provider binding is set up for local use only, but this build targets a real deployment.",
    fix: "Configure a connected or infrastructure source for the provider binding named in the error.",
  },
  {
    code: "RELKIT_PROVIDER_RUNTIME_INVALID",
    title: "Provider does not fit the job type",
    happened:
      "A jobs provider does not match the kind of job it runs, for example a task job bound to a provider that is not a task jobs adapter.",
    fix: "Bind the job to a jobs provider that supports its kind, then run `relkit build` again.",
  },
  {
    code: "RELKIT_RATE_LIMIT_INVALID",
    title: "Rate limit settings are invalid",
    happened:
      "A route's `rateLimit` needs a positive `limit`, a positive `windowMs` and a supported `key`, and one of these is missing or wrong.",
    fix: "Set `limit` and `windowMs` to positive numbers and use a supported `key.kind`.",
  },
  {
    code: "RELKIT_RATE_LIMIT_STORE_INVALID",
    title: "Rate limit store is not a usable cache",
    happened: "A route's rate limit `store` does not point at a cache that holds numbers.",
    fix: "Point `store` at a cache defined with `defineCache` that stores numeric values.",
  },
  {
    code: "RELKIT_RATE_LIMIT_STORE_REQUIRED",
    title: "Rate limit needs a shared store",
    happened:
      "A route has a rate limit with no `store`. Production builds need a shared cache so limits work across instances.",
    fix: "Set `rateLimit.store` to a shared cache defined with `defineCache`.",
  },
  {
    code: "RELKIT_RETRY_INVALID",
    title: "Retry settings are invalid",
    happened:
      "A retry setting is missing where it is required, or one of its values is not allowed.",
    fix: 'Use a positive `maxAttempts`, a `multiplier` of at least 1, `jitter` of `"none"`, `"full"` or `"equal"`, and a `maxDelayMs` not below `initialDelayMs`.',
  },
  {
    code: "RELKIT_ROUTE_COLLISION",
    title: "Two routes use the same path",
    happened:
      "Two routes answer the same method and path, or a route name clashes with the generated client's `jobs` namespace.",
    fix: "Change the path or method of one route, or rename the route that clashes with `jobs`.",
  },
  {
    code: "RELKIT_ROUTE_EXPORT_METHOD",
    title: "Route export is not an HTTP method",
    happened:
      "A route file uses a default export or an unsupported method, or a Better Auth route does not use `ALL`.",
    fix: "Export each route as a named HTTP method, such as `export const GET = defineRoute(...)`. Use `ALL` only for the Better Auth route.",
  },
  {
    code: "RELKIT_ROUTE_FILE_REQUIRED",
    title: "Route is outside the routes folder",
    happened: "A route is defined in a file that is not a `route.ts` under `src/routes`.",
    fix: "Move the route to `src/routes/**/route.ts`.",
  },
  {
    code: "RELKIT_ROUTE_LEGACY_TRANSPORT",
    title: "Route sets its own method and path",
    happened:
      "A route passes `method` and `path` to `defineRoute`. Routes now take these from their file location and export name.",
    fix: "Remove `method` and `path` from `defineRoute` and export it as GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS from `src/routes/**/route.ts`.",
  },
  {
    code: "RELKIT_ROUTE_MODULE_TYPE",
    title: "Route file exports are invalid",
    happened:
      "A route file exports no HTTP method, exports a name that is not a method, or exports something other than a typed route.",
    fix: "Export only named HTTP methods, each created with `defineRoute`, from the route file.",
  },
  {
    code: "RELKIT_ROUTE_RESERVED_PATH",
    title: "Route uses a reserved path",
    happened: "A route path starts with `/_relkit`, which RelKit keeps for its own endpoints.",
    fix: "Move the route to a path that does not start with `/_relkit`.",
  },
  {
    code: "RELKIT_ROUTE_RESPONSE_INCOMPATIBLE",
    title: "Route response does not match its function",
    happened:
      "A route repeats a response, lists an error its function does not declare, or describes a response that does not match the function.",
    fix: "Keep each response once and list only errors the target function declares in its `errors`.",
  },
  {
    code: "RELKIT_RUNTIME_ACTIVATION_FINGERPRINT_INVALID",
    title: "Build fingerprint is missing or stale",
    happened:
      "The build's fingerprint is missing, out of date, or does not match the rest of the build output.",
    fix: "Run `relkit build` again and deploy all of its output together.",
  },
  {
    code: "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
    title: "Integration package does not match",
    happened:
      "An integration package does not register what the app expects, or two packages claim the same integration ID.",
    fix: "Install the integration package version that matches your RelKit version, and remove duplicate integration packages.",
  },
  {
    code: "RELKIT_RUNTIME_INTEGRATION_METADATA_INVALID",
    title: "Integration details are invalid",
    happened: "The details an integration package provides at startup are missing or malformed.",
    fix: "Run `relkit build` again or reinstall the integration package.",
  },
  {
    code: "RELKIT_RUNTIME_INTEGRATION_PACKAGE_MISSING",
    title: "Integration package is missing",
    happened:
      "The app needs an integration package that is not installed or has no RelKit details.",
    fix: "Install the integration package named in the error with `bun add`, then run `relkit build` again.",
  },
  {
    code: "RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID",
    title: "Integration plan does not match the build",
    happened:
      "The build's integration plan file has an unsupported version or belongs to a different build.",
    fix: "Run `relkit build` again and deploy all of its output together.",
  },
  {
    code: "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE",
    title: "Two integrations provide the same feature",
    happened: "Two installed integration packages register the same capability and adapter.",
    fix: "Remove one of the integration packages named in the error so each feature has one provider.",
  },
  {
    code: "RELKIT_SCHEDULE_INVALID",
    title: "Schedule is invalid",
    happened:
      "A schedule is not in a list, repeats an ID, or lacks a five-field cron expression, a timezone, an overlap policy or JSON input.",
    fix: 'Give each schedule a unique `id`, a five-field `cron`, a `timezone`, `overlap` of `"skip"` or `"allow"`, and JSON `input`.',
  },
  {
    code: "RELKIT_SCHEMA_UNAVAILABLE",
    title: "Schema has no JSON Schema",
    happened:
      "RelKit needs a JSON Schema for this input or output to build docs, clients and checks, but the schema library could not produce one.",
    fix: "Use a Standard Schema library with JSON Schema support, such as Zod 4, ArkType, Valibot with `@valibot/to-json-schema`, or Effect Schema.",
    page: "/docs/errors/relkit-schema-unavailable",
  },
  {
    code: "RELKIT_SOURCE_LOCATION_INVALID",
    title: "Source location is invalid",
    happened: "RelKit could not find a valid file location for one of your definitions.",
    fix: "Make sure the definition is in a file under `src/`. If it is, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_SOURCE_RESOLUTION",
    title: "Import cannot be resolved",
    happened:
      "RelKit cannot resolve an import in your app, or cannot read the path aliases in `tsconfig.json`.",
    fix: "Check the import path and the `paths` aliases in `tsconfig.json`, then run `relkit check`.",
  },
  {
    code: "RELKIT_TASK_EXECUTION_INVALID",
    title: "Task run does not match the build",
    happened:
      "A queued task run does not match the task, build or input that the running app has registered, so RelKit refused to run it.",
    fix: "Run `relkit build` and deploy all of its output together. If it persists, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_TOOL_TARGET_INCOMPATIBLE",
    title: "Tool target does not match",
    happened:
      "A tool's target is not a function, or the tool's schemas differ from the function it calls.",
    fix: "Point the tool at a function made with `defineFunction` and use the same input and output schemas.",
  },
  {
    code: "RELKIT_TRANSFORM_ID_COLLISION",
    title: "Transform ID is used twice",
    happened: "A request transform has the same ID as another definition in your app.",
    fix: "Rename the transform, or give it an explicit `id` if the ID was taken from the file or export name.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
