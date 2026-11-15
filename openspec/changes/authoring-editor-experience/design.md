# Design

## Context

The owner's report is one position: the value of `defaults.bucket` in `defineApp`. A first measurement on the logistics application (18 positions) showed that most of what a developer types is suggested, and that two things are not: default profiles, and the role and permission names of `access`. This change measures every authoring surface before it fixes anything, so the fixes are chosen from data and the measurement stays as a test.

## How an editor position is measured

A driver gives three answers for one file whose text is replaced in memory: the suggestions at a cursor, the errors of the file, and the hover text. There are two drivers with the same interface:

- TypeScript 5.9: the JavaScript language service (`createLanguageService`), which is what an editor's TypeScript server runs.
- TypeScript 7: the language server of the native compiler (`tsc --lsp --stdio`), driven with the protocol messages an editor sends. TypeScript 7 has no JavaScript language service.

A probe names a fixture file, a piece of its text and a replacement. A suggestion probe puts the cursor at `|` and lists the names a developer expects; a diagnostic probe writes a wrong value and lists the text the one error must contain. The verdict is `works`, `partly`, `nothing` or `misleading`. For a value position outside quotes the editor lists the whole scope, so a known value counts only when it is ranked first.

The fixture is a small application in `tests/editor/fixture/`, resolved to this repository's source through the path mapping of `tests/types/tsconfig.json`. Its registries are written by hand in the generator's form.

## Decisions

### D1: One type parameter per capability in `defineApp`

Cause of the defect: `DefineAppOptions` is `DescriptorMetadata & Providers & {...}` and `Providers` is inferred from the whole options object.

- While the cursor is inside the options object, TypeScript blocks inference from every enclosing expression up to the call, so `Providers` falls back to its constraint and the type of a default is `string`.
- For a wrong name, `Providers` captures the `defaults` object as written. Its intersection with the declared type of `defaults` has a property of type `"wrong" & "uploads"`, which is `never`; an object type with such a property is `never` as a whole, so every property of `defaults` is reported.
- An option that does not exist becomes part of `Providers` and is accepted.

`defineApp` and `defineAppEffect` get one type parameter per capability, each inferred from its own option, with `undefined` as the default. `defaults` is typed from those parameters behind `NoInfer`, so a default is checked against a binding and never decides one. The options object is an ordinary object type again, so unknown options are reported.

Alternatives: keeping one `Providers` parameter and reading `Providers["bucket"]` does not work, because TypeScript does not infer a type parameter from a property typed as an indexed access; a mapped type over `keyof Providers` is inferred from the whole object and is blocked the same way.

The exported names stay: `DefineAppOptions<Shape, Providers, Exporters>`, `AppProviderDefaults<Providers>`, `ApplicationDescriptor<Shape, Providers, Exporters>`. Their `Providers` constraint widens from `AppProviderInputs` to `AppProviderBindings`, which also allows `undefined` for a capability. `AppProviderDefaults` no longer declares the removed key `job`; writing it is now an unknown-property error that suggests `jobs`, and the key is no longer suggested.

### D2: A default for a capability without a provider names the capability

Its type is `NoProviderConfigured<"model">`, an interface that exists for the error text: `Type 'string' is not assignable to type 'NoProviderConfigured<"model">'`. Leaving the key out of the type would give "does not exist in type", which does not say why. A string type holding a sentence would be suggested as a value.

### D3: Role and permission names come from the generated registry

The names exist in the application's Better Auth file. The type of a function's `access` cannot import that file, so the names reach it the way the session type does: through the context registry that `relkit dev` and `relkit check` generate.

- `@relkit/better-auth`: the service's handler type carries a second phantom member with the role and permission names of the instance's organization plugin (`ac.statements`, the keys of `roles`). Without the plugin both are `string`; with `dynamicAccessControl` roles are `string`; without `ac` or `roles` the plugin's defaults apply.
- `@relkit/cli`: the registry gains `interface ApplicationAccess extends InferBetterAuthAccess<...> {}` when the application has a Better Auth service.
- `relkit`: `access.roles` and `access.permissions` are arrays of `AccessRoleName` and `AccessPermissionName`, which read `Relkit.ApplicationAccess` and are `string` when it is empty.

The application is written as before. A project whose registry was generated by an earlier version keeps `string` until the registry is generated again.

### D4: Descriptions for `defineApp`'s options

The inventory shows that the editor has no description for any of the 18 options of `defineApp`. The provider options and `defaults` keys take theirs from `AppProviderInputs` (a mapped type keeps the description of the property it maps), the rest from `DefineAppOptions` and `DescriptorMetadata`, whose three properties (`title`, `description`, `tags`) every descriptor shares. The options of `server`, `server.apiDocs`, `inspector` and `telemetry` get theirs in their own types. Descriptions for the other surfaces are proposed, not done here.

### D5: `defineFunction` is one signature

Found while fixing D3. `defineFunction` had two overloads: without dependencies (`dependencies?: never`) and with them. When a call matches neither, TypeScript 5.9 reports "No overload matches this call" and checks the handler against a signature whose type parameters are `unknown`, so every `context.cache.prices` in the handler is a second error. A misspelled permission in a function with four dependencies was five errors. For suggestions, the editor read the first overload, where `dependencies` is `never`, and listed the whole scope.

The two overloads become one signature whose `Dependencies` parameter defaults to `{}`: a call without `dependencies` infers nothing for it and takes the default, which is what the first overload fixed by hand. The options type repeats `dependencies?: FunctionDependencies` beside `dependencies?: Dependencies`, so the property has members to suggest while the object is being typed. `defineFunctionEffect` changes the same way. The implementation is assigned with a type assertion, because one generic signature is compared more strictly than a set of overloads; the assertion replaces a check that the overloads did not make either.

The type tests of `tests/types/` pass unchanged on TypeScript 5.9 and 7, including every `@ts-expect-error`.

### D6: The survey is the test

`tests/editor/probes/` holds every position with its verdict. `tests/editor/authoring-editor.test.ts` measures each on both drivers and fails when a verdict differs, in either direction: a fixed position must be recorded as fixed. `bun run test:types` runs it after the compiler pass, so CI and `prepush` run it. `bun tests/editor/survey.ts` prints the table of `evidence/survey.md`.

## Risks

- **A caller passes type arguments to `defineApp`.** None does in the repository, its examples, templates or documentation. The changeset says so.
- **Strict permission names reject a name built at run time.** `AccessPermissionName` and `AccessRoleName` are exported for such a variable.
- **The language server's protocol changes.** The driver uses `initialize`, `didOpen`, `didChange`, `completion`, `diagnostic` and `hover` only.

## Non-goals

- Profile names in `defineBucket`, `defineCache`, `defineEvent` and `defineChannel`, path parameter names in `http.path()`, input field names in `http.input()`, unknown options in `defineFunction`, and the overloads of `defineTask`: measured, explained and proposed in `evidence/survey.md`.
- Descriptions for options outside `defineApp`, other than `title`, `description` and `tags`.
