# Effect operations

Use the Effect variants when validation or projection is part of an Effect
program. Invalid values fail with tagged errors, so callers can recover by tag.
The synchronous and promise-based helpers keep their established result and
exception shapes.

```ts
import { Effect } from "effect";
import {
  SchemaProjectorLive,
  SchemaValidatorLive,
  getJsonSchemaEffect,
  validateEffect,
  z,
} from "@relkit/app/schema";

const user = z.object({ name: z.string().min(1) });
const value = await Effect.runPromise(
  validateEffect(user, { name: "Ada" }).pipe(Effect.provide(SchemaValidatorLive)),
);
const projection = Effect.runSync(
  getJsonSchemaEffect(user).pipe(Effect.provide(SchemaProjectorLive)),
);
```

`SchemaValidator` and `SchemaProjector` accept test Layers for external schema
hooks. Every top-level operation records a span, a call count, a failure count,
and a duration under fixed operation labels. Composite asynchronous validators
run at most eight child checks concurrently and preserve result and issue order.
