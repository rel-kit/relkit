/**
 * Replays failed environment and source generations through the real CLI watcher.
 * Synthetic HTTP response markers prove repaired code is serving; each rejected
 * candidate must leave the previous marker available through the stable listener.
 */
import { expect } from "bun:test";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RecoveryProcess } from "./recovery.types.js";

/** Creates a declarative environment contract with either a required value or harmless default. */
export const environmentSource = (required: boolean) =>
  'import { defineEnv, env } from "@relkit/app/config";\nexport default defineEnv({ RECOVERY_VALUE: env.string()' +
  (required ? "" : '.default("initial")') +
  " });\n";

/** Creates a valid public function returning either its runtime env or an explicit source marker. */
export const handlerSource = (marker?: string) =>
  'import { defineFunction } from "@relkit/app/functions";\nimport { z } from "@relkit/app/schema";\n' +
  'export default defineFunction({ id:"hello.greet", input:z.object({}), output:z.object({message:z.string()}), ' +
  `handler:async (_input, context)=>({message:${marker === undefined ? "String(context.env.RECOVERY_VALUE)" : JSON.stringify(marker)}}) });\n`;

/**
 * Waits for an exact public response without confusing a previous-generation 200 with recovery.
 * @param session - Original CLI invocation.
 * @param marker - Semantic fixture value that the new generation must serve.
 * @returns Completion only after the actual HTTP body matches.
 */
export async function serving(session: RecoveryProcess, marker: string): Promise<void> {
  await session
    .wait(
      `Expected HTTP marker ${marker}`,
      async () => (await session.read()) === JSON.stringify({ message: marker }),
    )
    .catch(async (cause: Error) => {
      throw new Error(`Expected ${marker}; received ${await session.read()}`, { cause });
    });
}

/**
 * Waits for a rejected edit and proves old public traffic remains available.
 * @param session - Original CLI invocation.
 * @param before - Log offset captured before editing.
 * @param marker - Last valid response.
 * @returns Completion after a real rejection with the old response still serving.
 */
async function rejected(session: RecoveryProcess, before: number, marker: string) {
  await session.wait("Expected candidate rejection", () => {
    const recent = session.logs().slice(before);
    return recent.includes("Reload failed") || recent.includes('"message":"dev.generation.failed"');
  });
  expect(await session.read()).toBe(JSON.stringify({ message: marker }));
}

/**
 * Covers the original missing-value repair plus edits, atomic replacement and deletions.
 * @param root - Disposable installed fixture.
 * @param session - Original CLI process, never restarted during the cycle.
 * @returns Completion after all file states produce the expected HTTP values.
 */
export async function environmentCycle(root: string, session: RecoveryProcess): Promise<void> {
  let before = session.logs().length;
  await writeFile(join(root, "src/platform/env.ts"), environmentSource(true));
  await rejected(session, before, "initial");
  await writeFile(join(root, ".env.local"), "RECOVERY_VALUE=repaired\n");
  await serving(session, "repaired");
  await writeFile(join(root, ".env.local.next"), "BASE=latest\nRECOVERY_VALUE=$BASE/expanded\n");
  await rename(join(root, ".env.local.next"), join(root, ".env.local"));
  await serving(session, "latest/expanded");
  before = session.logs().length;
  await writeFile(join(root, ".env.local"), "");
  await rejected(session, before, "latest/expanded");
  await writeFile(join(root, ".env"), "RECOVERY_VALUE=base\n");
  await serving(session, "base");
  await writeFile(join(root, ".env.local"), "RECOVERY_VALUE=local\n");
  await serving(session, "local");
  await modeLocalCycle(root, session);
  before = session.logs().length;
  await writeFile(
    join(root, "src/platform/env.ts"),
    'import { defineEnv, env } from "@relkit/app/config";\nexport default defineEnv({ RECOVERY_VALUE: env.literal("valid") });\n',
  );
  await rejected(session, before, "local");
  await writeFile(join(root, ".env.local"), "RECOVERY_VALUE=valid\n");
  await serving(session, "valid");
  await writeFile(join(root, "src/platform/env.ts"), environmentSource(true));
  await rm(join(root, ".env.local"));
  await serving(session, "base");
  before = session.logs().length;
  await rm(join(root, ".env"));
  await rejected(session, before, "base");
  await writeFile(join(root, "src/platform/env.ts"), environmentSource(false));
  await serving(session, "initial");
}

/** Exercises the highest-precedence dotenv file through both native watcher paths. */
async function modeLocalCycle(root: string, session: RecoveryProcess) {
  const path = join(root, ".env.development.local");
  await writeFile(path, "RECOVERY_VALUE=mode-local\n");
  await serving(session, "mode-local");
  await writeFile(path + ".next", "RECOVERY_VALUE=mode-local-replaced\n");
  await rename(path + ".next", path);
  await serving(session, "mode-local-replaced");
  await rm(path);
  await serving(session, "local");
}

/**
 * Covers invalid syntax, graph/route descriptors, missing imports, deletion and burst saves.
 * @param root - Disposable installed fixture.
 * @param session - Original CLI invocation with last-valid traffic retained.
 * @returns Completion after each rejected edit and the final newest marker recover.
 */
export async function sourceCycle(root: string, session: RecoveryProcess): Promise<void> {
  const fn = join(root, "src/services/hello/functions/hello.function.ts");
  const service = join(root, "src/services/hello/service.ts");
  const original = await readFile(service, "utf8");
  const config = join(root, "relkit.config.ts"),
    tsconfig = join(root, "tsconfig.json");
  const configuration = await readFile(config, "utf8"),
    typescript = await readFile(tsconfig, "utf8");
  let marker = "initial";
  for (const scenario of ["syntax", "descriptor", "import", "deletion", "config", "tsconfig"]) {
    const before = session.logs().length;
    if (scenario === "syntax") await writeFile(fn, "export default (");
    if (scenario === "descriptor") await writeFile(service, "export default { invalid:true };");
    if (scenario === "import")
      await writeFile(service, original.replace("hello.function.js", "missing.function.js"));
    if (scenario === "deletion") await rm(fn);
    if (scenario === "config") await writeFile(config, "export default { invalid:true };");
    if (scenario === "tsconfig") await writeFile(tsconfig, "{");
    await rejected(session, before, marker);
    marker = `repaired-${scenario}`;
    await writeFile(service, original);
    if (scenario === "config") await writeFile(config, configuration);
    if (scenario === "tsconfig") await writeFile(tsconfig, typescript);
    await writeFile(fn, handlerSource(marker));
    await serving(session, marker);
  }
  const before = session.logs().length;
  await writeFile(fn, "export default (");
  await session.wait("Expected compilation before burst repair", () =>
    session.logs().slice(before).includes("candidate.compile.started"),
  );
  await writeFile(fn, handlerSource("intermediate"));
  await writeFile(service, "export default { invalid:true };");
  await writeFile(service, original);
  await writeFile(fn, handlerSource("newest"));
  await serving(session, "newest");
}
