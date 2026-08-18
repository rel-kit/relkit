# @zsys/tools

Tools are constrained views of functions. They inherit the target function's
input, output, and declared errors and add only approval and side-effect
metadata.

```ts
import { defineTool } from "@zsys/tools";
import lookupOrder from "./lookup-order.function";

export default defineTool({
  id: "orders.lookup-tool",
  target: lookupOrder,
  description: "Read one order by ID",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});
```
