import { defineTool } from "@zsys/app";
import hello from "../functions/hello.function.js";

export default defineTool({
  id: "hello.lookup",
  target: hello,
  description: "Read a greeting for a supplied name",
  sideEffect: "read",
  approval: "never",
});
