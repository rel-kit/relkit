# @zsys/functions

Functions are the only authored descriptors that own executable handlers.
Handlers are ordinary synchronous or asynchronous TypeScript functions.

```ts
import { defineError, defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";

const input = z.object({ name: z.string().min(1) });
const output = z.object({ greeting: z.string() });

export default defineFunction({
  input,
  output,
  onBefore: async (value, context) => ({ ...value, name: value.name.trim() }),
  handler: async (value, context) => {
    context.log.info("greeting requested");
    return { greeting: `Hello, ${value.name}!` };
  },
});
```

Declared dependencies add named Promise clients to the handler and hook context.
HTTP request state remains in route middleware and route mapping. Calls from
other functions use `target.invoke(input)` rather than a declared function
dependency map.

IDs are optional for source-scoped functions. The compiler derives a stable
filesystem-safe ID from the source/export hierarchy; keep an explicit ID when
a move must preserve identity. Application, event, job, bucket, and cache IDs
remain explicit.

`input` and `output` remain required runtime schemas: TypeScript types are
erased, while Standard Schemas drive validation, graph metadata, OpenAPI,
generated clients, tests, and inspector forms. HTTP routes infer routine
transport mappings and responses from these schemas.

Declare application failures once and return a new instance. Every error in a
function's `errors` list must be returned by its handler; the compiler checks
plain and optional Effect handlers, and Effect is not required for ordinary
functions. `fail` remains available for compatibility.

```ts
const invalidName = defineError({
  id: "greetings.invalid-name",
  data: z.object({ name: z.string() }),
  message: "Name is required",
  retry: "never",
});

const greet = defineFunction({
  input,
  output,
  errors: [invalidName],
  handler: (value) =>
    value.name.trim() === "" ? new invalidName(value) : { greeting: `Hello ${value.name}!` },
});
```

Functions can become tools without a second handler:

```ts
const lookup = greet.asTool({
  description: "Read a greeting",
  sideEffect: "read",
  approval: "never",
});

await lookup.invoke({ name: "Ada" });
```

`asTool` inherits the function schemas and errors. Declared error IDs may also
be inferred from source bindings; omitted `retry` is terminal, while
`retry: { kind: "later", afterMs }` is a minimum delay hint for jobs and
durable events. HTTP and direct calls never retry automatically.
