/** Joins validated optional catch-all segments into the path returned by documentation/file routes. */
import { defineFunction } from "@relkit/app/functions";
import { pathInput, pathOutput } from "../../../platform/schemas.js";

const browsePath = defineFunction({
  input: pathInput,
  output: pathOutput,
  handler: async ({ parts }) => ({ path: `/${parts?.join("/") ?? ""}` }),
});

export default browsePath;
