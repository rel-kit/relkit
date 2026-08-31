---
"@relkit/events": minor
"@relkit/functions": minor
---

Replace `onEvent` and selectors with authored `defineEventFunction` consumers. Events
declare `input`, and functions declare exact publication permissions with `publishes`.
Event-only functions accept delivery and replay through the common runtime and cannot
be invoked through HTTP, jobs, tools, services, or direct calls.

This pre-1.0 breaking release updates compiler and manifest contracts, local and AWS
delivery, deployment permissions, Inspector views, test helpers, examples, and generated
templates together. Existing applications must migrate their event authoring and
regenerate their artifacts; no compatibility aliases or persisted-state migration are
provided. API documentation can also exclude selected domains.
