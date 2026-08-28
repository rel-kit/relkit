import { defineFunction } from "@relkit/app/functions";
import { pathInput, pathOutput } from "@app/shared/schemas.js";

const browsePath = defineFunction({
  input: pathInput,
  output: pathOutput,
  handler: async ({ parts }) => ({ path: `/${parts?.join("/") ?? ""}` }),
});

export default browsePath;
