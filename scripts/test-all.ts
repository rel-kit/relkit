import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const firstLayers = [
  "test:jobs:quality",
  "test:e2e",
  "test:jobs:matrix",
  "test:types",
  "test:unit",
  "test:compiler",
  "test:contracts",
  "test:integration",
  "test:inspector",
  "test:container",
  "test:security",
  "test:deployment",
  "test:examples",
] as const;
const finalLayers = ["test:packages", "test:generator"] as const;

/** Runs every distinct local test layer with bounded concurrency. */
export async function runAllTests(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const startedAt = performance.now();
  try {
    await runScript("build", environment);
    const localEnvironment = { ...environment, RELKIT_AWS_INTEGRATION: "0" };
    await runScript("test:docs", localEnvironment);
    await runScript("test:restart", localEnvironment);
    await runLayers(firstLayers, localEnvironment);
    for (const script of finalLayers) await runScript(script, localEnvironment);
    if (environment.RELKIT_TEST_ALL_CLOUD !== "1") {
      console.log(
        "Cloud deployment integration skipped; set RELKIT_TEST_ALL_CLOUD=1 to enable it.",
      );
      return;
    }
    for (const name of ["RELKIT_AWS_INTEGRATION_REGION", "RELKIT_AWS_INTEGRATION_IMAGE"])
      if (environment[name] === undefined || environment[name]!.trim() === "")
        throw new Error(`${name} is required when RELKIT_TEST_ALL_CLOUD=1.`);
    await runScript("test:aws-integration", {
      ...environment,
      RELKIT_AWS_INTEGRATION: "1",
    });
  } finally {
    console.log(`Test suite elapsed: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
  }
}

async function runLayers(
  scripts: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  let next = 0;
  let failure: Error | undefined;
  const workers = Array.from({ length: Math.min(3, scripts.length) }, async () => {
    while (failure === undefined && next < scripts.length) {
      const script = scripts[next++]!;
      try {
        await runScript(script, environment);
      } catch (error) {
        if (failure !== undefined) return;
        failure = error instanceof Error ? error : new Error(String(error));
      }
    }
  });
  await Promise.all(workers);
  if (failure !== undefined) throw failure;
}

async function runScript(script: string, environment: NodeJS.ProcessEnv): Promise<void> {
  console.log(`\n▶ ${script}`);
  const startedAt = performance.now();
  const child = Bun.spawn([process.execPath, "run", script], {
    cwd: root,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  console.log(`◀ ${script}: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
  if (exitCode !== 0) throw new Error(`${script} failed with exit code ${exitCode}.`);
}

if (import.meta.main) {
  try {
    await runAllTests();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
