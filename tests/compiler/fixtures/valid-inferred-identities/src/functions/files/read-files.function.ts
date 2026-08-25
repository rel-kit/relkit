import { defineFunction } from "@zsys/app";
import { filesInput, filesOutput } from "../../shared/schemas.js";

const readFiles = defineFunction({
  input: filesInput,
  output: filesOutput,
  handler: async (input) => ({ count: input.parts.length }),
});

export default readFiles;
