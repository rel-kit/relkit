# @zsys/functions

Functions are the only authored descriptors that own executable handlers.
Handlers are ordinary synchronous or asynchronous TypeScript functions.

```ts
import { defineError, defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";

const input = z.object({ name: z.string().min(1) });
const output = z.object({ greeting: z.string() });

export default defineFunction({
  id: "greetings.say-hello",
  input,
  output,
  handler: async (value, request, context) => {
    request?.headers.get("x-request-id");
    context.log.info("greeting requested");
    return { greeting: `Hello, ${value.name}!` };
  },
});
```

Declared dependencies add named Promise clients to the handler context. No
runtime framework type is needed in application code.

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
  id: "greetings.say-hello",
  input,
  output,
  errors: [invalidName],
  handler: (value) =>
    value.name.trim() === "" ? new invalidName(value) : { greeting: `Hello ${value.name}!` },
});
```
