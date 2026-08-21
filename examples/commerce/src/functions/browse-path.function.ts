import { defineFunction } from "@zsys/app";
import { pathInput, pathOutput } from "../shared/schemas.js";

const browsePath = defineFunction({
  input: pathInput,
  output: pathOutput,
  handler: async ({ parts }, request) => {
    const requestParts = request?.params.parts;
    const pathParts = Array.isArray(requestParts) ? requestParts : parts;
    return { path: `/${pathParts?.join("/") ?? ""}` };
  },
});

export default browsePath;
