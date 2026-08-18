# @zsys/functions

Functions are the only authored descriptors that own executable handlers.
Handlers are ordinary synchronous or asynchronous TypeScript functions.

```ts
import { defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";

const input = z.object({ name: z.string().min(1) });
const output = z.object({ greeting: z.string() });

export default defineFunction({
  id: "greetings.say-hello",
  input,
  output,
  handler: async (value, context) => {
    context.log.info("greeting requested");
    return { greeting: `Hello, ${value.name}!` };
  },
});
```

Declared dependencies add named Promise clients to the handler context. No
runtime framework type is needed in application code.
