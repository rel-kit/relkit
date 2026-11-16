# Design

## Context

`openspec/changes/archive/2026-11-16-authoring-editor-experience/evidence/survey.md` lists the positions that do not work and proposes six follow-ups. The lead decided how five of them are done; the sixth (path parameters and the keys of `http.input()`) stays with `relkit check`. The decisions below are written down as the work is done.

## Decisions

### D1: Profile names come from the generated registry

The names are in `relkit.config.ts`. A descriptor file cannot import the configuration, so the names reach `profile` the way access names do: the registry declares `interface ApplicationProfiles`, built from the type of the configuration's default export, and `profile` reads it through `ProviderProfileName<"bucket">`. The type is `string` when the registry has no entry for the capability or the capability has no provider, so a library and an application with an earlier registry type-check as before.

### D2: An unknown option has a named type

The options object of `defineFunction` and its siblings is a type parameter, because the return type reads the declared errors and tool metadata from it. A key that is not an option is therefore accepted. A mapped type over the keys that are not options gives each the type `UnknownOption<"key">`, and `publishes` the type `RemovedOption<"publishes", "dependencies.events">`, so the error is on the key and its text says what is wrong.

### D3: One signature per authoring API

As for `defineFunction`: an overload per form makes the editor read one form for suggestions and makes TypeScript 5.9 report "No overload matches this call". The form becomes a type parameter with a default, and the handler's context depends on it.

### D4: Descriptions are one line in the option's own type

They are written where the option is declared, so the editor and the generated API page show the same text.

### D5: The API pages print interfaces from their declaration

An interface that a module re-exports was printed as `declare const Name: Name`. The provider options of `defineApp` are written out in `DefineAppOptions`, so its printed block lists them.

## Non-goals

- Path parameter names in `http.path()` and the keys of `http.input()`: TypeScript has no type to offer at those positions; `relkit check` reports both.
