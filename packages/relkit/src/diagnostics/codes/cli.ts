/** Codes reported by cli. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const cliCodes = [
  {
    code: "RELKIT_ADD_API_UNAVAILABLE",
    title: "Scaffolding support could not be loaded",
    happened:
      "`relkit add` could not load the `create-relkit` package it uses to add files to your project.",
    fix: "Reinstall the CLI with `bun add -d @relkit/cli`, run `bun install`, then run `relkit add` again.",
  },
  {
    code: "RELKIT_ADD_CANCELLED",
    title: "relkit add was cancelled",
    happened: "You cancelled `relkit add` before it finished, so no changes were kept.",
    fix: "Run `relkit add` again when you are ready.",
  },
  {
    code: "RELKIT_ADD_COLLISION",
    title: "Added code would overwrite existing code",
    happened:
      "`relkit add` found a file, service or `package.json` entry that already exists with different content, so it stopped instead of overwriting it.",
    fix: "Choose a different name, or rename or remove the existing file or entry named in the message, then run `relkit add` again.",
  },
  {
    code: "RELKIT_ADD_INSTALLATION_FAILED",
    title: "Dependency installation failed after relkit add",
    happened:
      "`relkit add` updated your project, but installing the new dependencies with `bun install` failed.",
    fix: "Run `bun install` in the project to see the full error, fix it (often network or registry access), then run `relkit add` again.",
  },
  {
    code: "RELKIT_ADD_INVALID_PROJECT",
    title: "Project cannot be extended by relkit add",
    happened:
      "`relkit add` needs a RelKit project with a valid `package.json` and `relkit.config.ts`, and found a missing file, invalid `package.json` field or service layout problem.",
    fix: "Run the command from your project root (or pass `--project-root`), and fix the file named in the message.",
  },
  {
    code: "RELKIT_ADD_UNSUPPORTED_SOURCE_SHAPE",
    title: "Source file is too customized to edit",
    happened:
      "`relkit add` needs to edit a file in your project, but the file no longer has a shape it can safely change, such as an app or database service it cannot find.",
    fix: "Make the change by hand using the docs for what you are adding, or restore the file named in the message to its generated shape.",
  },
  {
    code: "RELKIT_ADD_USAGE",
    title: "Invalid relkit add arguments",
    happened:
      "`relkit add` received an unknown kind, an invalid name, conflicting options or an option without its value.",
    fix: "Run `relkit add --help` to see the accepted kinds and options, then run the command again.",
  },
  {
    code: "RELKIT_ADD_VALIDATION_FAILED",
    title: "Project check failed after relkit add",
    happened:
      "`relkit add` made its changes, but the follow-up `bun run check` reported errors, so the changes were not kept.",
    fix: "Run `relkit check` to see the errors in your project, fix them, then run `relkit add` again.",
  },
  {
    code: "RELKIT_ARTIFACT_WRITE_FAILED",
    title: "Generated files could not be written",
    happened:
      "RelKit checked your project but could not write the generated files to `.relkit/generated`.",
    fix: "Make sure the project directory is writable and has free disk space, then run the command again.",
  },
  {
    code: "RELKIT_BUILD_FAILED",
    title: "Build failed",
    happened: "`relkit build` stopped because of an error while building your app.",
    fix: "Read the message above, run `relkit check` to see project errors, fix them and run `relkit build` again.",
  },
  {
    code: "RELKIT_BUILD_USAGE",
    title: "Invalid relkit build arguments",
    happened:
      "`relkit build` received an option it does not accept, an option without its value, or a port outside 0 to 65535.",
    fix: "Run `relkit build --help` to see the accepted options, then run the command again.",
  },
  {
    code: "RELKIT_CANDIDATE_ACTIVATION_MISMATCH",
    title: "Reloaded app does not match the build",
    happened:
      "During `relkit dev`, the reloaded app reported a different set of active features than the build RelKit produced.",
    fix: "Stop `relkit dev` and start it again. If this keeps happening, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_CANDIDATE_API_VERSION_UNSUPPORTED",
    title: "Reloaded app uses an unsupported internal API",
    happened:
      "During `relkit dev`, the reloaded app did not expose the internal health endpoint this CLI expects, usually because RelKit packages are on different versions.",
    fix: "Put all `@relkit/*` packages on the same version, run `bun install`, then restart `relkit dev`.",
  },
  {
    code: "RELKIT_CANDIDATE_ENVIRONMENT_NOT_READY",
    title: "Reloaded app environment is not ready",
    happened:
      "During `relkit dev`, the reloaded app started but reported that its environment variables are not valid yet.",
    fix: "Run `relkit env check` to see which variables are missing or invalid, fix them, then save a file to reload.",
  },
  {
    code: "RELKIT_CANDIDATE_GENERATION_MISMATCH",
    title: "Reloaded app reported the wrong version",
    happened:
      "During `relkit dev`, the health check answered for a different version of your app than the one RelKit started.",
    fix: "Make sure no other process is using the same port, then restart `relkit dev`.",
  },
  {
    code: "RELKIT_CANDIDATE_GENERATOR_VERSION_UNSUPPORTED",
    title: "Reloaded app was built by a different RelKit version",
    happened:
      "During `relkit dev`, the reloaded app's manifest was generated by a RelKit version this CLI does not support.",
    fix: "Put all `@relkit/*` packages on the same version, run `bun install`, then restart `relkit dev`.",
  },
  {
    code: "RELKIT_CANDIDATE_GRAPH_HASH_MISMATCH",
    title: "Reloaded app does not match its graph",
    happened:
      "During `relkit dev`, the reloaded app reported an application graph that differs from the one RelKit built.",
    fix: "Stop `relkit dev`, delete `.relkit/generated`, and start `relkit dev` again.",
  },
  {
    code: "RELKIT_CANDIDATE_GRAPH_VERSION_UNSUPPORTED",
    title: "Reloaded app uses an unsupported graph version",
    happened:
      "During `relkit dev`, the reloaded app reported a graph format version this CLI does not support.",
    fix: "Put all `@relkit/*` packages on the same version, run `bun install`, then restart `relkit dev`.",
  },
  {
    code: "RELKIT_CANDIDATE_HEALTH_TIMEOUT",
    title: "Reloaded app did not become healthy in time",
    happened:
      "During `relkit dev`, the reloaded app did not answer its health checks before the time limit, so RelKit kept the previous version running.",
    fix: "Check the logs above for slow or failing startup code, such as a database connection, fix it and save a file to reload.",
  },
  {
    code: "RELKIT_CANDIDATE_MANIFEST_VERSION_UNSUPPORTED",
    title: "Reloaded app uses an unsupported manifest version",
    happened:
      "During `relkit dev`, the reloaded app reported a runtime manifest version this CLI does not support.",
    fix: "Put all `@relkit/*` packages on the same version, run `bun install`, then restart `relkit dev`.",
  },
  {
    code: "RELKIT_CANDIDATE_PROVIDER_NOT_READY",
    title: "Reloaded app services are not ready",
    happened:
      "During `relkit dev`, the reloaded app started but reported that a provider it depends on, such as a database, is not ready.",
    fix: "Check the logs above for the provider that failed, make sure its local service is running with `relkit local status`, then save a file to reload.",
  },
  {
    code: "RELKIT_CANDIDATE_RESPONSE_INVALID",
    title: "Reloaded app returned an invalid health response",
    happened:
      "During `relkit dev`, the reloaded app answered its health check with a response RelKit could not read.",
    fix: "Make sure your app does not override RelKit's internal routes, then restart `relkit dev`. If it persists, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_CHECK_FAILED",
    title: "Project check failed",
    happened: "`relkit check` stopped because of an error while analyzing your project.",
    fix: "Read the message above, fix the file it names, then run `relkit check` again.",
  },
  {
    code: "RELKIT_CHECK_USAGE",
    title: "Invalid relkit check arguments",
    happened:
      "`relkit check` received an option it does not accept, an option without its value, or a port outside 0 to 65535.",
    fix: "Run `relkit check --help` to see the accepted options, then run the command again.",
  },
  {
    code: "RELKIT_CLIENT_CONTRACT_DRIFT",
    title: "Generated client is out of date",
    happened:
      "`relkit client check` found that the generated client no longer matches the server's current client contract.",
    fix: "Run `relkit client pull <baseUrl> --out <directory>` to update the client, then build the frontend again.",
  },
  {
    code: "RELKIT_CLIENT_CONTRACT_INVALID",
    title: "Client contract is invalid",
    happened:
      "The client contract downloaded from the server is not valid JSON, or its hash, procedures or errors are malformed.",
    fix: "Make sure `<baseUrl>` points at a RelKit server, rebuild the server with `relkit build`, then run `relkit client pull` again.",
  },
  {
    code: "RELKIT_CLIENT_CONTRACT_MISSING",
    title: "No client contract in the output directory",
    happened: "`relkit client check` found no generated client contract in the given directory.",
    fix: "Run `relkit client pull <baseUrl> --out <directory>` first, then run `relkit client check` again.",
  },
  {
    code: "RELKIT_CLIENT_CONTRACT_TOO_LARGE",
    title: "Client contract is too large",
    happened:
      "The client contract returned by the server is larger than the download limit `relkit client pull` accepts.",
    fix: "Make sure `<baseUrl>` points at the RelKit server and not a proxy or other page, then try again.",
  },
  {
    code: "RELKIT_CLIENT_PROTOCOL_UNSUPPORTED",
    title: "Client contract version is not supported",
    happened:
      "The server returned a client contract with a protocol or version this CLI does not support.",
    fix: "Put the server and CLI on the same RelKit version, rebuild the server with `relkit build`, then run `relkit client pull` again.",
  },
  {
    code: "RELKIT_CLIENT_PULL_FAILED",
    title: "Client contract download failed",
    happened: "The server answered the client contract request with an HTTP error status.",
    fix: "Make sure the server is running at `<baseUrl>` and reachable, and set `RELKIT_CLIENT_PULL_TOKEN` if it requires one, then try again.",
  },
  {
    code: "RELKIT_CLIENT_URL_INVALID",
    title: "Client base URL is not HTTP or HTTPS",
    happened: "`relkit client pull` needs an `http://` or `https://` base URL for the server.",
    fix: "Pass a full URL such as `http://localhost:3000`, then run the command again.",
  },
  {
    code: "RELKIT_CLIENT_USAGE",
    title: "Invalid relkit client arguments",
    happened:
      "`relkit client` received an unknown subcommand or option, or is missing the base URL or `--out` directory.",
    fix: "Run `relkit client pull <baseUrl> --out <directory>` or `relkit client check <baseUrl> --out <directory>`.",
  },
  {
    code: "RELKIT_CLI_CANCELLED",
    title: "Command menu was cancelled",
    happened: "You closed the interactive `relkit` menu before choosing a command.",
    fix: "Run `relkit` again to open the menu, or run a command directly, such as `relkit dev`.",
  },
  {
    code: "RELKIT_CLI_CLEANUP_FAILED",
    title: "Cleanup failed after the command finished",
    happened:
      "The command finished, but RelKit could not release one or more resources afterwards, such as a temporary file or child process.",
    fix: "Check for leftover processes or files named in the message and remove them. If this keeps happening, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_CLI_USAGE",
    title: "Invalid relkit arguments",
    happened:
      "The `relkit` command line could not be parsed, for example `--help` and `--version` were both passed or an option was malformed.",
    fix: "Run `relkit --help` to see the commands and options, then run the command again.",
  },
  {
    code: "RELKIT_COMMAND_UNAVAILABLE",
    title: "Unknown relkit command",
    happened: "`relkit` does not have a command with the name you typed.",
    fix: "Run `relkit --help` to see the available commands, and check that `@relkit/cli` is up to date.",
  },
  {
    code: "RELKIT_CREATE_API_UNAVAILABLE",
    title: "Project generator could not be loaded",
    happened:
      "`relkit create` could not load the `create-relkit` package it uses to generate projects.",
    fix: "Reinstall the CLI, or run `bun create relkit` instead.",
  },
  {
    code: "RELKIT_CREATE_CANCELLED",
    title: "Project creation was cancelled",
    happened:
      "You cancelled project creation before it finished, so the new project was not created.",
    fix: "Run the create command again when you are ready.",
  },
  {
    code: "RELKIT_CREATE_CLI_UNAVAILABLE",
    title: "RelKit CLI missing in the new project",
    happened:
      "The project was generated, but `node_modules/.bin/relkit` was not found, so RelKit could not run its first project check.",
    fix: "Run `bun install` in the new project, then run `bun run check`.",
  },
  {
    code: "RELKIT_CREATE_DESTINATION_EXISTS",
    title: "Destination directory already exists",
    happened: "The directory you chose for the new project already exists.",
    fix: "Choose a new directory name, or pass `--force-empty-directory` if the existing directory is empty.",
  },
  {
    code: "RELKIT_CREATE_DESTINATION_INVALID",
    title: "Destination path is invalid",
    happened:
      "The destination for the new project is not a valid local path, is not a directory, or could not be read.",
    fix: "Choose a destination path whose parent folders exist and are directories you can read.",
  },
  {
    code: "RELKIT_CREATE_DESTINATION_NOT_EMPTY",
    title: "Destination directory is not empty",
    happened: "The directory you chose for the new project already contains files.",
    fix: "Choose a directory that does not exist yet, or empty this one first.",
  },
  {
    code: "RELKIT_CREATE_DESTINATION_UNSAFE",
    title: "Destination path is unsafe",
    happened:
      "The destination is a symbolic link, the current directory, a filesystem root or another broad directory that RelKit will not write a project into.",
    fix: "Choose a new, specific directory for the project, such as `./my-app`.",
  },
  {
    code: "RELKIT_CREATE_FAILED",
    title: "Project creation failed",
    happened:
      "Generating the new project stopped because of an error, and RelKit removed the files it had written.",
    fix: "Read the message above, fix the cause (often disk space, permissions or network), then run the create command again.",
  },
  {
    code: "RELKIT_CREATE_NAME_INVALID",
    title: "Project name is not a valid package name",
    happened: "The project name must be a valid npm package name.",
    fix: "Use lowercase letters, digits and dashes, such as `my-app`, then run the command again.",
  },
  {
    code: "RELKIT_CREATE_TEMPLATE_INVALID",
    title: "Project template is invalid",
    happened:
      "The selected project template is missing a file, has no `@relkit/app` dependency or contains an entry RelKit cannot copy.",
    fix: "Reinstall `create-relkit` with the latest version and try again. If it persists, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_CREATE_TEMPLATE_MISSING",
    title: "Project template not found",
    happened: "The template you selected is not included in this version of `create-relkit`.",
    fix: "Run the create command with `--help` to see the available templates, or update `create-relkit` and try again.",
  },
  {
    code: "RELKIT_CREATE_UNTESTED",
    title: "Project combination has not been tested",
    happened:
      "The template and options you chose have not been tested with this RelKit and Bun version. Creation continues unless you passed `--strict`.",
    fix: "Pick a tested combination listed in the message, or continue without `--strict` and check the new project with `bun run check`.",
    page: "/docs/modules/cli/relkit-create-untested",
  },
  {
    code: "RELKIT_CREATE_USAGE",
    title: "Invalid create arguments",
    happened:
      "The create command received an unknown option, an invalid value or an option without its value.",
    fix: "Run the create command with `--help` to see the accepted options, then run it again.",
  },
  {
    code: "RELKIT_DB_CONFIG",
    title: "Invalid database migration configuration",
    happened:
      "`relkit db migrate` received invalid arguments, or the Drizzle configuration file could not be used.",
    fix: "Run `relkit db migrate [--config <path>]` and make sure the file (default `drizzle.config.ts`) exports a valid Drizzle configuration.",
  },
  {
    code: "RELKIT_DB_DEPENDENCY",
    title: "Drizzle is not installed",
    happened: "`relkit db migrate` needs `drizzle-orm` and `drizzle-kit` installed in your app.",
    fix: "Run `bun add drizzle-orm` and `bun add -d drizzle-kit` in the app, then migrate again.",
  },
  {
    code: "RELKIT_DB_HISTORY",
    title: "Migration history is missing or incompatible",
    happened:
      "`relkit db migrate` found no migration files, an empty history or one written for a different Drizzle version.",
    fix: "Run `bun run db:generate`, review the generated migrations for your installed Drizzle versions, then migrate again.",
  },
  {
    code: "RELKIT_DB_MIGRATE_FAILED",
    title: "Database migration failed",
    happened:
      "A migration statement failed. RelKit did not retry it, and a rollback is not guaranteed.",
    fix: "Check your database connection settings and the failing SQL in the output, fix them, then run `relkit db migrate` again.",
  },
  {
    code: "RELKIT_DEPLOYMENT_PLAN_INVALID",
    title: "Deployment plan is invalid",
    happened: "The saved deployment plan has a missing or malformed field.",
    fix: "Run `relkit deploy preview` to create a fresh plan, then deploy again.",
  },
  {
    code: "RELKIT_DEPLOYMENT_PLAN_VERSION_UNSUPPORTED",
    title: "Deployment plan version is not supported",
    happened:
      "The saved deployment plan was written in a format version this RelKit version does not support.",
    fix: "Run `relkit deploy preview` to create a fresh plan, then deploy again.",
  },
  {
    code: "RELKIT_DEPLOY_BUILD_FAILED",
    title: "Build failed before deployment",
    happened: "`relkit deploy` builds your app first, and that build failed.",
    fix: "Run `relkit build` to see the errors, fix them, then run `relkit deploy` again.",
  },
  {
    code: "RELKIT_DEPLOY_CHECK_FAILED",
    title: "Project check failed before deployment",
    happened:
      "`relkit deploy` checks your project first, and the check failed or the project changed while planning.",
    fix: "Run `relkit check`, fix the errors it reports, then run `relkit deploy` again.",
  },
  {
    code: "RELKIT_DEPLOY_CONFIGURATION_MISSING",
    title: "Deployment configuration is missing",
    happened: "The deployment needs a configuration value that was not provided.",
    fix: "Pass the missing value with `relkit deploy --config name=value`, then run the command again.",
  },
  {
    code: "RELKIT_DEPLOY_FAILED",
    title: "Deployment failed",
    happened: "`relkit deploy` stopped because of an error from RelKit or the deployment provider.",
    fix: "Read the message above, fix the cause, then run `relkit deploy preview` to check the plan before deploying again.",
  },
  {
    code: "RELKIT_DEPLOY_GRAPH_INVALID",
    title: "Application graph cannot be deployed",
    happened:
      "The checked application graph is not valid JSON, has more or fewer than one app, or has an app ID that does not match.",
    fix: "Run `relkit check` to regenerate the graph, then run `relkit deploy` again.",
  },
  {
    code: "RELKIT_DEPLOY_GRAPH_VERSION_UNSUPPORTED",
    title: "Application graph version is not supported",
    happened:
      "The application graph was generated in a format version the deployment tools do not support.",
    fix: "Put all `@relkit/*` packages on the same version, run `relkit check`, then deploy again.",
  },
  {
    code: "RELKIT_DEPLOY_LIVE_OBJECT_UNSUPPORTED",
    title: "Graph contains a live object",
    happened:
      "The application graph contains a live runtime object, such as a client or function, which cannot be part of a deployment plan.",
    fix: "Declare deployment settings as plain values in your app definition, then run `relkit check` and deploy again.",
  },
  {
    code: "RELKIT_DEPLOY_PLAN_INVALID",
    title: "Saved deployment plan is not valid JSON",
    happened: "The deployment plan file could not be read as JSON.",
    fix: "Run `relkit deploy preview` to create a fresh plan, then deploy again.",
  },
  {
    code: "RELKIT_DEPLOY_PROFILE_UNSUPPORTED",
    title: "Provider profile does not support a feature",
    happened:
      "Your app uses a capability that the selected deployment provider profile does not implement.",
    fix: "Choose a provider profile that supports this capability, or remove the feature named in the message from your app.",
  },
  {
    code: "RELKIT_DEPLOY_ROLE_INVALID",
    title: "Deployment has more than one integration for a role",
    happened:
      "The deployment found several integrations for a role that needs exactly one, or a binding lists the same access role twice.",
    fix: "Keep one integration for the role named in the message in your app definition, then run `relkit deploy` again.",
  },
  {
    code: "RELKIT_DEPLOY_ROLE_MISSING",
    title: "Deployment is missing a required integration",
    happened:
      "The deployment needs one integration for the role named in the message, and none is configured.",
    fix: "Add the deployment integration for that role to your app, then run `relkit deploy` again.",
  },
  {
    code: "RELKIT_DEPLOY_SECRET_UNSUPPORTED",
    title: "Graph contains a secret value",
    happened:
      "The application graph contains a secret value, which must never be written into a deployment plan.",
    fix: "Read the secret from an environment variable instead of writing it in code, or pass it with `relkit deploy --config-secret name=value`.",
  },
  {
    code: "RELKIT_DEPLOY_USAGE",
    title: "Invalid relkit deploy arguments",
    happened:
      "`relkit deploy` received an unknown subcommand or option, an option without its value, or an invalid `--backend` or `--config` value.",
    fix: "Run `relkit deploy --help` to see the accepted subcommands and options, then run the command again.",
  },
  {
    code: "RELKIT_DEV_COMPILE_FAILED",
    title: "Project has errors at dev startup",
    happened: "`relkit dev` checked your project before starting it and found errors.",
    fix: "Fix the errors listed above, then run `relkit dev` again.",
  },
  {
    code: "RELKIT_DEV_USAGE",
    title: "Invalid relkit dev arguments",
    happened:
      "`relkit dev` received an option it does not accept, an option without its value, or an invalid `--port`, `--local` or `--log-level` value.",
    fix: "Run `relkit dev --help` to see the accepted options, then run the command again.",
  },
  {
    code: "RELKIT_DOCTOR_FAILED",
    title: "relkit doctor could not finish",
    happened: "`relkit doctor` stopped because of an unexpected error while inspecting your setup.",
    fix: "Read the message above, fix the cause, then run `relkit doctor` again.",
  },
  {
    code: "RELKIT_DOCTOR_USAGE",
    title: "Invalid relkit doctor arguments",
    happened:
      "`relkit doctor` received an unknown option, an option without its value, an invalid port or the retired `--inspector-port` option.",
    fix: "Run `relkit doctor --help` to see the accepted options. Set the inspector port with `inspector.connection.port` in `relkit.config.ts`.",
  },
  {
    code: "RELKIT_DRAIN_STATE_INVALID",
    title: "Previous app version could not be stopped",
    happened:
      "During `relkit dev`, RelKit tried to stop the previous version of your app after a reload, but it was no longer tracking that version.",
    fix: "Restart `relkit dev`. If this keeps happening, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_DRAIN_TOKEN_MISMATCH",
    title: "Reload targeted the wrong app version",
    happened:
      "During `relkit dev`, a request to stop the previous version of your app did not match the version currently running.",
    fix: "Restart `relkit dev`. If this keeps happening, report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_ENVIRONMENT_INVALID",
    title: "Environment variables are invalid at startup",
    happened:
      "Your built server could not start because one or more environment variables are missing or do not match your environment definition.",
    fix: "Run `relkit env check` to see which variables are wrong, set them, then start the server again.",
  },
  {
    code: "RELKIT_ENV_FAILED",
    title: "relkit env could not finish",
    happened: "`relkit env` stopped because of an unexpected error while reading your environment.",
    fix: "Read the message above, fix the cause, then run the `relkit env` command again.",
  },
  {
    code: "RELKIT_ENV_INVALID",
    title: "Environment module has no definition",
    happened:
      "Your environment file loaded, but it does not export an environment definition RelKit can read.",
    fix: "Export the environment definition from `src/platform/env.ts`, then run the command again.",
  },
  {
    code: "RELKIT_ENV_NOT_FOUND",
    title: "Environment file not found",
    happened: "RelKit could not find or load your environment file at `src/platform/env.ts`.",
    fix: "Create `src/platform/env.ts`, or run the command from your project root.",
  },
  {
    code: "RELKIT_ENV_UNKNOWN",
    title: "Unknown environment variable",
    happened:
      "The variable you passed to `relkit env explain` is not declared in your environment definition.",
    fix: "Run `relkit env list` to see the declared variables, then try again with one of those names.",
  },
  {
    code: "RELKIT_ENV_USAGE",
    title: "Invalid relkit env arguments",
    happened:
      "`relkit env` received an unknown subcommand or option, more than one variable name, or an option that only `env example` accepts.",
    fix: "Run `relkit env --help` to see the accepted subcommands and options, then run the command again.",
  },
  {
    code: "RELKIT_GRAPH_FAILED",
    title: "relkit graph could not finish",
    happened: "`relkit graph` stopped because of an unexpected error while reading a graph.",
    fix: "Read the message above, fix the cause, then run the `relkit graph` command again.",
  },
  {
    code: "RELKIT_GRAPH_HASH_INVALID",
    title: "Expected graph hash has the wrong format",
    happened:
      "The value passed to `--hash` is not in the form `sha256:` followed by 64 lowercase hex characters.",
    fix: "Copy the hash exactly as `relkit graph print` shows it, then run the command again.",
  },
  {
    code: "RELKIT_GRAPH_HASH_MISMATCH",
    title: "Graph hash does not match",
    happened: "The graph's calculated hash differs from the one you passed with `--hash`.",
    fix: "Run `relkit check` to regenerate the graph, or update the expected hash if the change is intended.",
  },
  {
    code: "RELKIT_GRAPH_INVALID",
    title: "Application graph is invalid",
    happened:
      "The application graph file is not valid JSON or does not have the shape RelKit expects.",
    fix: "Run `relkit check` to regenerate the graph, then run the command again.",
  },
  {
    code: "RELKIT_GRAPH_NOT_FOUND",
    title: "Application graph file not found",
    happened: "RelKit could not find the graph file at the path in the message.",
    fix: "Run `relkit check` to generate the graph, or pass the correct path to `relkit graph`.",
  },
  {
    code: "RELKIT_GRAPH_USAGE",
    title: "Invalid relkit graph arguments",
    happened:
      "`relkit graph` received an unknown subcommand or option, an option without its value, or the wrong number of paths.",
    fix: "Run `relkit graph print|check|diff [paths]`, giving two paths to `diff`, or see `relkit graph --help`.",
  },
  {
    code: "RELKIT_GRAPH_VERSION_UNSUPPORTED",
    title: "Application graph version is not supported",
    happened:
      "The application graph was generated in a format version this RelKit version does not support.",
    fix: "Put all `@relkit/*` packages on the same version, then run `relkit check` or `relkit build` to regenerate it.",
  },
  {
    code: "RELKIT_INSPECTOR_INVALID",
    title: "Inspector package is broken",
    happened:
      "`@relkit/inspector` is installed, but its `package.json` does not declare the `relkit-inspector` command.",
    fix: "Reinstall it with `bun add -d @relkit/inspector`, then run `relkit inspector` again.",
  },
  {
    code: "RELKIT_INSPECTOR_MISSING",
    title: "Inspector is not installed",
    happened:
      "`relkit inspector` needs `@relkit/inspector`, which is not installed in this project.",
    fix: "Run `relkit add inspector` to install and enable it, then run `relkit inspector` again.",
  },
  {
    code: "RELKIT_INSPECTOR_USAGE",
    title: "Invalid relkit inspector arguments",
    happened: "`relkit inspector` received an option without its value.",
    fix: "Run `relkit inspector --help` to see the accepted options, then run the command again.",
  },
  {
    code: "RELKIT_INTERNAL_ERROR",
    title: "Unexpected internal error",
    happened: "RelKit hit an error it did not expect and could not classify.",
    fix: "Report this on the RelKit issue tracker with the full output.",
  },
  {
    code: "RELKIT_INTERRUPTED",
    title: "Command was interrupted",
    happened:
      "The command stopped because it received an interrupt signal, such as Ctrl-C, SIGTERM or SIGHUP.",
    fix: "Run the command again when you are ready. If you did not stop it, check what sent the signal.",
  },
  {
    code: "RELKIT_JOBS_FAILED",
    title: "relkit jobs could not finish",
    happened: "`relkit jobs` stopped because of an unexpected error.",
    fix: "Read the message above, fix the cause, then run the `relkit jobs` command again.",
  },
  {
    code: "RELKIT_JOBS_REQUEST_FAILED",
    title: "Jobs request to the server failed",
    happened:
      "The running server rejected the jobs request, returned an unexpected response, or has no job with that name.",
    fix: "Make sure your app is running with `relkit dev` and the job name is correct, then try again.",
  },
  {
    code: "RELKIT_JOBS_USAGE",
    title: "Invalid relkit jobs arguments",
    happened:
      "`relkit jobs` received an unknown subcommand or option, or the `PORT` environment variable is not a valid port.",
    fix: "Run `relkit jobs --help` to see the accepted subcommands and options, and check `PORT` if you set it.",
  },
  {
    code: "RELKIT_JOB_CONTROL_UNKNOWN",
    title: "Job control result is unknown",
    happened:
      "RelKit sent a control request, such as cancel, for a job, but could not confirm whether the jobs provider applied it.",
    fix: "Check the job's state in your jobs provider's dashboard before sending the request again.",
  },
  {
    code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
    title: "Job submission result is unknown",
    happened:
      "RelKit sent a job to the jobs provider but could not confirm whether it was accepted, for example because the request timed out.",
    fix: "Retry with the same operation ID and idempotency key so the job is not started twice.",
  },
  {
    code: "RELKIT_LAYOUT_ACTIVE_DEV",
    title: "Dev server is running during layout migration",
    happened: "`relkit migrate layout` found a `relkit dev` process running for this project.",
    fix: "Stop the dev process named in the message, then run `relkit migrate layout` again.",
  },
  {
    code: "RELKIT_LAYOUT_CHECK_FAILED",
    title: "Project check failed during layout migration",
    happened:
      "`relkit migrate layout` checked a copy of your project before and after moving files, and the check failed.",
    fix: "Run `relkit check` and fix the reported errors, then run `relkit migrate layout` again.",
  },
  {
    code: "RELKIT_LAYOUT_CONCURRENT_EDIT",
    title: "Files changed during layout migration",
    happened:
      "Source files changed while `relkit migrate layout` was running, so it stopped before writing.",
    fix: "Finish your edits, then run `relkit migrate layout` again to preview a fresh plan.",
  },
  {
    code: "RELKIT_LAYOUT_CONFLICT",
    title: "Layout migration has conflicts",
    happened: "`relkit migrate layout` found files it cannot move without conflicts.",
    fix: "Resolve each conflict listed in the message by hand, then run `relkit migrate layout` again.",
  },
  {
    code: "RELKIT_LAYOUT_CONTRACT_CHANGED",
    title: "Layout migration would change app behavior",
    happened:
      "Moving the files would change your app's public contracts or deployment setup, so `relkit migrate layout` stopped.",
    fix: "Run `relkit migrate layout` without `--write` to review the plan, adjust the files it names, then try again.",
  },
  {
    code: "RELKIT_LAYOUT_DESTINATION_EXISTS",
    title: "Layout migration target already exists",
    happened: "`relkit migrate layout` wants to move a file to a path that already exists.",
    fix: "Rename or remove the file at the path in the message, then run `relkit migrate layout` again.",
  },
  {
    code: "RELKIT_LAYOUT_DIRTY",
    title: "Files to migrate have uncommitted changes",
    happened:
      "A tracked file that `relkit migrate layout` needs to move has uncommitted changes in Git.",
    fix: "Commit or stash your changes, then run `relkit migrate layout` again.",
  },
  {
    code: "RELKIT_LAYOUT_FAILED",
    title: "Layout migration failed",
    happened: "`relkit migrate layout` stopped because of an unexpected error.",
    fix: "Read the message above, fix the cause, then run `relkit migrate layout` again.",
  },
  {
    code: "RELKIT_LAYOUT_GIT_UNAVAILABLE",
    title: "Git status could not be read",
    happened:
      "`relkit migrate layout` needs Git to check for uncommitted changes, and the Git command failed.",
    fix: "Make sure `git` is installed and works in the project directory, then run the command again.",
  },
  {
    code: "RELKIT_LAYOUT_INVALID_PROJECT",
    title: "Not a RelKit project",
    happened:
      "`relkit migrate layout` needs both `package.json` and `relkit.config.ts` in the project root.",
    fix: "Run the command from your project root, or pass `--project-root <path>`.",
  },
  {
    code: "RELKIT_LAYOUT_PROCESS_INSPECTION_UNAVAILABLE",
    title: "Running processes could not be checked",
    happened:
      "`relkit migrate layout` could not list running processes to make sure `relkit dev` is not running.",
    fix: "Make sure no `relkit dev` process is running for this project, check that `ps` is available, then try again.",
  },
  {
    code: "RELKIT_LAYOUT_RECEIPT_INVALID",
    title: "Layout migration record is invalid",
    happened:
      "The migration record passed to `--rollback` does not belong to this project or describes changes RelKit will not apply.",
    fix: "Pass the record path printed by the migration you want to undo, from the same project, or restore the files with Git.",
  },
  {
    code: "RELKIT_LAYOUT_RECOVERY_CONFLICT",
    title: "Rollback kept a later edit",
    happened:
      "While undoing the layout migration, RelKit found a file you edited afterwards and kept your edit instead of overwriting it.",
    fix: "Review the file named in the message and merge the changes by hand.",
  },
  {
    code: "RELKIT_LAYOUT_TYPECHECK_FAILED",
    title: "Type check failed during layout migration",
    happened:
      "The migrated copy of your project failed type checking, or type checking could not run, so no files were changed.",
    fix: "Run `bun x tsc --noEmit` in the project and fix the errors, then run `relkit migrate layout` again.",
  },
  {
    code: "RELKIT_LAYOUT_USAGE",
    title: "Invalid relkit migrate arguments",
    happened:
      "`relkit migrate` received an unknown subcommand or option, an option without its value, or both `--write` and `--rollback`.",
    fix: "Run `relkit migrate layout` with `--write` or `--rollback <path>`, not both.",
  },
  {
    code: "RELKIT_LOCAL_CHECK_FAILED",
    title: "Project check failed before starting local services",
    happened: "`relkit local` checks your project first, and the check failed.",
    fix: "Run `relkit check`, fix the errors it reports, then run the `relkit local` command again.",
  },
  {
    code: "RELKIT_LOCAL_FAILED",
    title: "relkit local could not finish",
    happened:
      "`relkit local` stopped because of an unexpected error while managing local services.",
    fix: "Read the message above, make sure Docker is running if your services use it, then try again.",
  },
  {
    code: "RELKIT_LOCAL_INVALID",
    title: "Local services setup is invalid",
    happened:
      "Your app's local service setup is inconsistent: the app ID is invalid or services need more than one local runner.",
    fix: "Check your app's ID and local integrations in `relkit.config.ts`, then run `relkit check` and try again.",
  },
  {
    code: "RELKIT_LOCAL_LEASE_HELD",
    title: "Local services are in use by another session",
    happened: "Another `relkit dev` session is already using this project's local services.",
    fix: "Stop that session with Ctrl-C (its process ID is in the message), then try again.",
  },
  {
    code: "RELKIT_LOCAL_SERVICE_NOT_FOUND",
    title: "Local service is not declared",
    happened: "The service you passed to `--service` is not declared by this project.",
    fix: "Run `relkit local status` to see the declared services, then try again with one of those names.",
  },
  {
    code: "RELKIT_LOCAL_USAGE",
    title: "Invalid relkit local arguments",
    happened:
      "`relkit local` received an unknown subcommand or option, an option without its value, or `reset` without confirmation.",
    fix: "Run `relkit local up|status|stop|reset [options]`, and pass `--yes` to `reset` when not running interactively.",
  },
  {
    code: "RELKIT_PULUMI_WORKSPACE_INVALID",
    title: "Pulumi workspace settings are invalid",
    happened:
      "The Pulumi settings for this deployment are invalid, such as an empty work directory, an unsupported backend URL or a stack name with unsupported characters.",
    fix: "Fix the setting named in the message, for example pass `--backend cloud`, `local` or an `s3://`, `azblob://` or `gs://` URL, then deploy again.",
  },
  {
    code: "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED",
    title: "Runtime integration plan version is not supported",
    happened:
      "The generated runtime integration plan uses a format version this RelKit version does not support.",
    fix: "Put all `@relkit/*` packages on the same version, then run `relkit check` to regenerate it.",
  },
  {
    code: "RELKIT_SERVICE_LAYOUT",
    title: "Service files are in the wrong place",
    happened:
      "A service is in a location RelKit does not support, such as a nested or duplicate service, mixed layouts or an invalid service directory name.",
    fix: "Move the file named in the message to `src/services/<service>/service.ts`, or run `relkit migrate layout` to preview the fix.",
  },
  {
    code: "RELKIT_START_USAGE",
    title: "Invalid relkit start arguments",
    happened:
      "`relkit start` received an option it does not accept, an option without its value, or a port outside 0 to 65535.",
    fix: "Run `relkit start --help` to see the accepted options, then run the command again.",
  },
  {
    code: "RELKIT_TASK_RUNTIME_UNAVAILABLE",
    title: "Task-backed jobs are not supported yet",
    happened:
      "Your app defines task-backed jobs, and the runtime that runs them is not available in this RelKit version.",
    fix: "Run these jobs through a jobs integration such as `@relkit/inngest` or `@relkit/trigger`, or remove them, then build again.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
