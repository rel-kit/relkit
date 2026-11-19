# Design

## Context

`openspec/changes/archive/2026-11-16-authoring-editor-experience/evidence/survey.md` lists the positions that do not work and proposes six follow-ups. The lead decided how five of them are done; the sixth (path parameters and the keys of `http.input()`) stays with `relkit check`. The decisions below are written down as the work is done.

## Decisions

### D1: Profile names come from the generated registry

The names are in `relkit.config.ts`. A descriptor file cannot import the configuration, so the names reach `profile` the way access names do: the registry declares `interface ApplicationProfiles`, built from the type of the configuration's default export, and `profile` reads it through `ProviderProfileName<"bucket">`. The type is `string` when the registry has no entry for the capability or the capability has no provider, so a library and an application with an earlier registry type-check as before.

### D2: An unknown option has a named type

The options object of `defineFunction` and `defineEventFunction` is a type parameter, because the return type reads the declared errors and tool metadata from it. A key that is not an option is therefore accepted. A mapped type over the keys that are not options gives each the type `UnknownOption<"key">`, and `publishes` the type `RemovedOption<"publishes", "dependencies.events">`, so the error is on the key and its text says what is wrong. `publishes` is no longer declared as an option, so it is not suggested.

`defineTask` and `defineJob` were measured first and do not share the pattern: they take a plain options object, and TypeScript's own check reports an extra key on that key. They are left as they are, with probes that record it.

### D3: One signature per authoring API

`defineTask` was one signature already. TypeScript 5.9 suggested one `execution` value because the `Execution` parameter defaulted to `"durable"`, and that compiler reads the default while the option is being typed. The parameter defaults to every form now; `TaskForm` resolves a call without `execution` to `durable`, so the handler's context and the descriptor's type do not change. `execution` is declared in `DefineTaskCallOptions`, outside `DefineTaskOptions`, so that it alone is where the parameter is inferred.

`defineRoute` had an overload per form. Its options and its returned descriptor are now conditional on the `Target` parameter, which is `undefined` for a raw route. The handler parameter stays constrained to the handler type, so a raw handler's parameter keeps its type from the context.

`defineMiddleware` and `defineBetterAuthService` stay overloaded: the forms of the first differ in the kind of an argument, and the second form of the other is deprecated.

### D4: Descriptions are one line in the option's own type

They are written where the option is declared, so the editor and the generated API page show the same text.

### D5: The API pages print interfaces from their declaration

An interface that a module re-exports was printed as `declare const Name: Name`. The provider options of `defineApp` are written out in `DefineAppOptions`, so its printed block lists them.

## Non-goals

- Path parameter names in `http.path()` and the keys of `http.input()`: TypeScript has no type to offer at those positions; `relkit check` reports both.
