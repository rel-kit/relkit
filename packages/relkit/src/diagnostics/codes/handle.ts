/** Codes about the runtime handle used outside function handlers. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const handleCodes = [
  {
    code: "RELKIT_APPLICATION_BUILD_UNAVAILABLE",
    title: "No build for createRelkit",
    happened:
      "`createRelkit(config)` found no build of the application in `.relkit/build`, or the build was made by a version without `createRelkit`.",
    fix: "Run `relkit build` in the project root, then run the script again. Pass `{ root }` when the script runs from another directory.",
  },
  {
    code: "RELKIT_APPLICATION_NOT_RUNNING",
    title: "No application is running",
    happened:
      "Code called `getRelkit()` outside a running RelKit application, for example from a script or a test that started no application.",
    fix: "Call `getRelkit()` only in code the application runs, such as raw routes, middleware and `server.onStart`. In a script, create a handle with `createRelkit(config)` and close it when done.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
