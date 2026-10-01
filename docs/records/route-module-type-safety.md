# Route module type safety

Filesystem routes now have an explicit module contract. Each runtime export must be a
supported HTTP method containing a route descriptor. `ALL` requires a raw route;
the compiler additionally verifies its Better Auth ownership and catch-all path.

`relkit check` writes `.relkit/generated/route-module-checks.ts` from the current source
file list before evaluating descriptors. The validator imports each route module's
types and checks them against `RouteModuleContract`. It contains no executable route
imports. Using a `.ts` file ensures `skipLibCheck` cannot disable the assertions.
Regenerating the file removes deleted routes and includes newly added routes, including
when their exports prevent the application from compiling.

New starter projects include this file explicitly in `tsconfig.json`. Existing apps can
add the same configuration:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@relkit/cli/editor" }]
  },
  "files": [".relkit/generated/route-module-checks.ts"]
}
```

Merge these entries into existing configuration. Run `bun run check` to generate the
validator, then `bun run typecheck`. After adding or removing a route, regenerate with
`check` or keep `dev` running. The CLI includes the configured generated directory
when type checking, including applications that exclude `.relkit` from source discovery.

The `@relkit/cli/editor` TypeScript language-service plugin validates unsaved route
exports and offers a destructuring fix for a service-route table assigned to one method.
It shares its source rules with compiler normalization, recognizes aliased and namespace
imports, and checks exported values through TypeScript symbols, including reexports.
Generated contracts also let it compare exported values to full descriptor types.
For inferred function routes, dynamic filename parameters must exist in the target
function's input schema. For example, `users/[id]/route.ts` requires an `id` input
field. Generated contracts and editor diagnostics check this at the route boundary;
the compiler also rejects it with `RELKIT_MAPPING_INCOMPATIBLE`. Explicit request
mappings can rename or intentionally omit path parameters. Functions and services
remain reusable independently of a route's filename.
New starters configure the workspace TypeScript SDK for VS Code. Existing editor
sessions need to select the workspace TypeScript version and restart the TypeScript server
after adding the plugin.

In VS Code, `typescript.tsdk` does not select the workspace SDK automatically. Run
`TypeScript: Select TypeScript Version` and choose `Use Workspace Version`, then
`TypeScript: Restart TS Server`. Bundled TypeScript searches its own installation
for project plugins; it does not search the application's `node_modules` by default.
`typescript.tsserver.pluginPaths` is a machine setting and cannot fix this from a
project's `.vscode/settings.json`.

The plugin passes the editor's TypeScript API through its shared checks. This is
required when the editor's version differs from RELKIT's pinned version: TypeScript
6 changed numeric type flags, including `Never`, which previously caused a missing
path input to be mistaken for an explicit request mapping.

Public `defineServiceRoutes` and `defineServiceRoutesEffect` signatures reject unsupported
method keys even when the same object contains supported methods. Previously, a generic
constraint accepted `{ GET: "example", TRACE: "example" }` and `{ GET: "example", ALL:
"example" }`; these failed only when constructing the route table.

Failed checks preserve the previous valid runtime manifest. Normal development logging
shows every compiler diagnostic, alongside the existing indication that the previous
version is still serving.

## Authoring boundary audit

The audit inspected the existing public type fixtures and added explicit checks that
inferred public values do not become `any`:

| Boundary       | Evidence                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functions      | Invocation inputs, validated outputs, schema transforms and declared dependencies retain their types.                                                                                 |
| Services       | Public members preserve original function identity and input types; missing members and non-function members are rejected.                                                            |
| Routes         | Method tables, `any`, unsupported/default exports, malformed descriptors and incorrect reexports fail generated checks. Mixed valid/invalid method tables fail at the authoring call. |
| Events         | Event payload types and declared publication permissions are checked; input transformations remain distinct from publication input.                                                   |
| Tasks and jobs | Task input/output and job descriptors retain types; incompatible output and execution-mode/context operations are rejected.                                                           |
| Providers      | Profile defaults are constrained to declared names; secret connection fields reject ordinary environment bindings.                                                                    |

Type fixtures exercise these contracts against source APIs. Compiler regression tests
exercise installed public declarations with `skipLibCheck`, and the CLI regression
checks rejection, manifest preservation, and recovery in a generated application.
Editor tests load the CommonJS package entry through Node and TypeScript's actual
plugin resolver, then exercise unsaved edits and the code fix through a real TypeScript
language service. The CLI ships a physical `editor/package.json` entry because the
server's plugin resolver uses Node 10 module resolution and ignores export maps.

Graph-dependent constraints remain compiler checks: path/schema shape compatibility,
duplicate descriptor identities, provider compatibility and Better Auth mounting.
External request data continues to require runtime schema validation.

Development shutdown closes the proxy and stops the inspector concurrently. Waiting
for the proxy first can deadlock on requests from the inspector, preventing a local
framework rebuild from restarting the backend. A real demo session now completes
that restart and serves the updated route through the inspector proxy.

The demo's apparently stale `id` response was a separate output contract issue:
the handler returned `id`, but its output schema only declared `value`. Adding `id`
to the output schema updated the live response without restarting the server.

## Verification

- Root `bun run typecheck`, including the commerce application, passed.
- Public type fixtures passed, including negative method and module contracts.
- Focused compiler, editor, CLI recovery, development logging and scope-setting tests passed.
- Existing route package tests and compiler discovery/identity tests passed.
- The demo application's `check` and backend/frontend `typecheck` passed.
- Node loaded the editor entry through TypeScript's actual plugin resolver; the CLI
  package dry run included the resolver entry and CommonJS bundle.
- Formatting, lint, configuration validation and `git diff --check` passed.

Repository-wide guardrails still encounter two pre-existing failures: the scope scan
includes `packages/compiler/coverage/coverage-final.json`, and package export smoke
rejects the current `@relkit/events` export map. These checks are not reported as passing.
