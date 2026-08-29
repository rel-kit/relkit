import hello from "@app/hello/functions/hello.function.js";

export default hello.asTool({
  id: "hello.lookup",
  description: "Read a greeting for a supplied name",
  sideEffect: "read",
  approval: "never",
});
