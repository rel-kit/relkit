# @relkit/tools

Tools are constrained, handler-free views of functions. They inherit the target
function's input, output, and declared errors and add only approval and
side-effect metadata. Prefer `function.asTool` when the tool belongs with its
function; `defineTool` is useful when metadata lives in another module.

```ts
import lookupOrder from "./lookup-order.function";

const lookup = lookupOrder.asTool({
  description: "Read one order by ID",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});

export default lookup;
```

Invoke a tool directly with `await lookup.invoke(input)`. Input validation runs
before approval, required approval fails closed without a resolver, and the
target still enters the common function engine with source `tool`.

The package also exposes Effect operations. `defineToolEffect` constructs the
descriptor in the typed error channel, and `invokeToolEffect` obtains its engine
from `ToolEngineService`. This lets tests supply a deterministic engine Layer.

Call `defineToolEffect(options)` to construct a descriptor. For invocation,
provide `ToolEngineLive(engine)` to `invokeToolEffect({ tools, toolId,
arguments })` and run the resulting Effect with your application runtime.

Tool operations emit `tools.*` spans and fixed-label operation, failure, and
duration metrics. `ToolTelemetry` can be supplied in a Layer when an
application needs a custom observer.
