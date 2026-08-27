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
