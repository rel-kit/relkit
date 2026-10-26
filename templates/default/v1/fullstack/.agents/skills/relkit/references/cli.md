# CLI commands in a generated project

These examples use the local binary through `bun run relkit`. The installed CLI's `--help` is authoritative if its version differs from the template.

## Service and HTTP scaffolding

| Goal                                           | Command                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Create a domain with a public example function | `bun run relkit add service Billing`                                                           |
| Select extra domain artifacts                  | `bun run relkit add service Billing --include function --include error`                        |
| Create the full domain bundle                  | `bun run relkit add service Billing --full`                                                    |
| Add a public callable function                 | `bun run relkit add function "Send Receipt" --service billing`                                 |
| Add a standalone GET handler                   | `bun run relkit add route '/status' --mode route`                                              |
| Map an existing public member to HTTP          | `bun run relkit add route '/billing' --mode service-route --service billing --map GET=example` |

`--include` is repeatable and exclusive with `--full`. `--service` selects an existing generic domain; `--create-service` creates it while adding an artifact. Use `--internal` on a function or event that should stay out of the public service API. A service route needs one or more `--map METHOD=member` values in noninteractive use; the member must be a public callable function. Quote paths containing `*` or `?`.

## Database and auth

| Goal                                         | Command                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Scaffold a SQLite Drizzle service            | `bun run relkit add database --orm drizzle --dialect sqlite`              |
| Scaffold Better Auth and its catch-all route | `bun run relkit add auth --adapter better-auth --database-dialect sqlite` |

Database `--dialect` and auth `--database-dialect` also accept `postgresql` and `mysql`. Auth's `--base-path` changes the default `/api/auth` mount. The CLI adds dependencies and an environment example as needed, but it does not apply database migrations or populate secrets. Follow the scaffold's reported next steps after reviewing the schema and environment values.

Run `bun run db:generate`, review tracked SQL/metadata under the database service's
`migrations` directory, then explicitly run `bun run db:migrate`. The latter uses
installed `relkit db migrate`, defaulting to root `drizzle.config.ts`; select another
with `bun run relkit db migrate --config <path>`. Configuration owns the target,
history and supported log settings; relative paths use the app root. No copied
runner is needed. See [database tooling](data-apis.md) for environment and failure behavior.

## Other add kinds

Run `bun run relkit add <kind> --help` for each kind's flags and requirements:

| Area            | Kinds                                    |
| --------------- | ---------------------------------------- |
| Domain behavior | `function`, `task`, `error`, `constants` |
| Events and work | `event`, `event-function`, `job`         |
| Providers       | `cache`, `bucket`                        |
| AI              | `tool`, `prompt`, `agent`                |
| HTTP            | `middleware`, `transform`, `route`       |

For example, jobs need a target task, tools need an existing or newly created function, and agents need a prompt or inline instructions. Check the existing service and profile before selecting one. `--no-install` skips installing newly required packages and may skip verification; `--project-root <directory>` targets another app. `bun run relkit --json add ...` disables prompts and emits structured results for automation.

There is no `relkit add channel` or `relkit add observability` kind. Author channels with `defineChannel` and configure observability in `defineApp({ telemetry })`; see the [realtime](realtime-apis.md) and [observability](observability-apis.md) references.

For streaming responses, scaffold a function and route, then edit the function's output to `streamOf(itemSchema)` and the route's `stream` option; see the [streaming reference](streaming-apis.md).

## Inspect and run the app

| Goal                                                       | Command                                               |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| Validate the application graph                             | `bun run check`                                       |
| Typecheck and test                                         | `bun run typecheck`, `bun run test`                   |
| Start the app and selected development features            | `bun run dev`                                         |
| Start separately installed Inspector for an enabled bridge | `bunx --no-install relkit-inspector --project-root .` |
| Inspect the graph                                          | `bun run relkit graph print`                          |
| Inspect environment value status                           | `bun run relkit env list`                             |
| Validate active environment values                         | `bun run relkit env check`                            |
| Explain one environment declaration                        | `bun run relkit env explain NAME`                     |
| Render a safe environment example                          | `bun run relkit env example`                          |
| Check local prerequisites                                  | `bun run relkit doctor`                               |
| Inspect local service status                               | `bun run relkit local status`                         |
| Build or start a built app                                 | `bun run build`, `bun run start`                      |

Use `bun run relkit --help` to discover additional `graph`, `env`, `local`, `jobs`, `client`, and deployment commands. Start Docker-backed local services with `bun run relkit local up --detach` only when the app actually declares and needs them. Deployment commands require a configured deployment target.

For optional flat-to-grouped migration, use `bun run relkit migrate layout` for preview, `--write` for validated publication, and `--rollback <receipt>` for guarded restoration. See [layout migration](layout-migration.md). After `--no-install`, install dependencies and run `bun run relkit dev --prepare` before evaluating prepared-start readiness.
