# Code style, documentation, and layout

Read [Effect code style](effect-code-style.md) before composing new or changed
runtime code. Its API choices supplement all layout and documentation rules below.

## Document and organize

- Keep every new or edited authored source file at most 200 physical lines after
  formatting, including imports, comments, and blank lines. This includes test
  files and type/schema companions; generated, dependency, and vendor files stay
  outside the authored scope. Split larger files into cohesive modules while
  preserving public exports, dependency direction, and resource ownership.
  Do not remove useful documentation, compress formatting, or move unrelated
  code together to satisfy the limit. The separate function-body limit in
  [implementation standards](implementation-standards.md#implement-together)
  still applies.
- For every new or edited authored source file, write a concrete opening overview
  after licenses/directives and before imports/declarations. Explain what this
  module owns, its inputs/outputs, how its neighbors use it, and the relevant
  execution/resource/error boundaries. Describe actual behavior, not a filename
  paraphrase, hint, test pointer, or speculative guarantee. A small leaf still
  needs enough context to explain its role; use a short paragraph for services,
  adapters, error definitions, schemas, types, and test suites. Omit irrelevant
  topics rather than filling a template. See the examples in tsdoc-comments.md.
- Exported callables and non-trivial internal functions require meaningful
  summaries, @param for each parameter, @returns for returned values, and
  @typeParam for generic roles. Summary-only documentation is insufficient.
- Describe lazy Effect execution, success values, typed failures, required
  services, and lifecycle where relevant. Use @remarks for subtle contracts,
  and @throws only for actual thrown exceptions.
- Keep checked @example snippets focused on the documented member: show its
  call and meaningful result, or its recovery when that is the subject. Assume
  normal imports and an available instance, naming those assumptions in prose.
  Do not repeat imports, Layer setup, unrelated services, or runPromise boilerplate.
  Show provisioning only when documenting construction/provisioning itself.
  Typecheck/execute snippets in a separate test harness that supplies the omitted
  setup. Link related examples instead of embedding an entire application cycle.
- Document schemas, services, errors, and companion types. Document each error
  payload field and each non-obvious public contract member at its declaration;
  class-level prose does not explain a member's meaning or recovery use. Review existing
  comments throughout the file. Add inline comments explaining invariants,
  ordering, ownership, recovery, and cleanup; avoid narrating obvious syntax.
- Explain the non-obvious decision, the invariant it preserves, and the failure
  it prevents beside the code that relies on it. Keep comments consistent with
  implementation, defaults, and tests; remove stale claims. Comments about
  atomicity, retries, cancellation, and assertion safety require actual evidence.
- Put one blank line between functions, classes, methods, schemas, services,
  and type declarations. Separate logical member groups. Keep documentation
  attached to declarations and respect existing formatter configuration.
- For larger directory scopes, organize by domain and repeat this shape for
  meaningful nested domains. Use descriptive names, as below:

  ```text
  <domain>/
    index.ts                 # intentional public exports
    <domain>.service.ts      # service contract, live Layer, composition
    <module>.ts              # logic; focused services/Layers where useful
    <module>.types.ts        # named types/interfaces, derived schema types
    <module>.schemas.ts      # executable schemas/validation contracts
    <domain>.utils.ts        # shared domain utilities
    <nested-domain>/         # repeat only the files this domain needs
  ```

  Create only useful files; retain simple layouts for small/file scopes.
  Keep imports directed toward owning leaves, not their own index.ts barrel.
  Preserve public exports when moving code; avoid circular service composition.
- Preserve the repository's naming, import, and formatting conventions. Prefer
  precise readonly contracts, brands, and discriminated unions where they
  express real domain constraints. Never write the TypeScript `unknown` keyword
  in authored code, tests, type parameters, assertions, or documentation snippets.
  Model known data with precise schema-derived types or truthful domain unions.
  For a genuinely generic boundary, preserve a meaningful input type parameter
  and decode before domain use. Foreign APIs may infer an untrusted value: narrow
  or decode it immediately, without authoring an unknown annotation or propagating
  it into service contracts. Normalize foreign rejections to a documented Error
  or a typed SDK failure at the adapter; preserve original rejection identity at
  a required compatibility edge through the supported error-cause mechanism.
  Do not evade this rule with any, object, {}, broad value unions, aliases to an
  unknown library type, unchecked casts, or invented validated contracts.
  For an unavoidable assertion, explain the guard or construction invariant
  that proves it, and verify the claimed relationship.
- Move named interfaces/type aliases into colocated <module>.types.ts files.
  Preserve public exports and interface augmentation using type-only imports
  and re-exports. Derive schema types rather than duplicating shapes.
  This placement overrides examples that colocate types with runtime schemas.
  Put executable schemas in <module>.schemas.ts when the domain layout applies;
  keep services and error classes in appropriate runtime modules. Connect schema
  types with type-only imports/re-exports; avoid duplicate shapes, runtime cycles,
  and empty companions.

## Readability before compression

Apply these rules to new code and refactors, including telemetry, adapters,
service construction, callbacks, and test helpers:

- Prefer a straight sequence of named domain steps. Keep service-owned make
  readable: acquire shared dependencies, define named methods, return the checked
  implementation. Extract cohesive helpers only when they explain a responsibility.
- Replace nested ternaries and compound handler selection with clear guards or
  exhaustive branches. Compute outcome separately from deciding how to report it.
  Call the chosen Effect operation directly in its branch; do not assign a log
  function through a conditional expression and invoke it later.
- Give policies names that explain intent. Pass an options object or a small
  discriminated policy instead of positional boolean switches. Document why a
  compatibility mode exists and preserve its externally visible behavior.
- Use Effect modules when they solve the actual task; do not add Match, Services,
  wrappers, files, or generic abstractions simply to replace an obvious if.
- Length checks are necessary but insufficient. Reject a result that technically
  fits the limits by packing logic into expressions, scattering trivial helpers,
  or moving unclear implementation into an anonymous callback.
