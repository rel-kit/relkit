import { defineFunction } from "@zsys/app";
import { pathInput, pathOutput } from "../shared/schemas.js";

const browsePath = defineFunction({
  id: "content.browse-path",
  input: pathInput,
  output: pathOutput,
  handler: async ({ parts }) => ({ path: `/${parts?.join("/") ?? ""}` }),
});

export default browsePath;
