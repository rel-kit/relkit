import { defineFunction } from "@relkit/app";
import { filesInput, filesOutput } from "../../platform/schemas.js";

const readFiles = defineFunction({
  input: filesInput,
  output: filesOutput,
  handler: async (input) => ({ count: input.parts.length }),
});

export default readFiles;
