/** Starts the two editors the survey and the test measure, over the fixture project. */
import { join, resolve } from "node:path";
import { createLanguageServerDriver } from "./language-server.js";
import { createLanguageServiceDriver, type EditorDriver } from "./language-service.js";

const root = resolve(import.meta.dir, "../..");

/** Directory of the fixture application. */
export const FIXTURE = join(import.meta.dir, "fixture");

/** The editors by name; each starts on demand. */
export const EDITORS: Readonly<Record<string, () => Promise<EditorDriver>>> = {
  // TypeScript 5.9 is the version generated applications start with. The documentation site is
  // the workspace package that depends on it, so a clean install resolves it from there.
  "TypeScript 5.9 language service": async () =>
    createLanguageServiceDriver({
      project: join(import.meta.dir, "tsconfig.json"),
      typescriptFrom: join(root, "apps/docs"),
      major: 5,
    }),
  // The workspace compiler is TypeScript 7; its language server is the same binary.
  "TypeScript 7 language server": () =>
    createLanguageServerDriver({ projectDirectory: import.meta.dir, typescriptFrom: root }),
};
