import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const localLayers = [
  "test:types",
  "test:unit",
  "test:compiler",
  "test:contracts",
  "test:integration",
  "test:restart",
  "test:inspector",
  "test:generator",
  "test:container",
  "test:security",
  "test:deployment",
  "test:e2e",
] as const;

/** Runs the root test layers in their documented fail-fast order. */
export async function runAllTests(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  for (const script of localLayers)
    await runScript(script, { ...environment, ZSYS_AWS_INTEGRATION: "0" });
  if (environment.ZSYS_TEST_ALL_CLOUD !== "1") {
    console.log("Cloud deployment integration skipped; set ZSYS_TEST_ALL_CLOUD=1 to enable it.");
    return;
  }
  for (const name of ["ZSYS_AWS_INTEGRATION_REGION", "ZSYS_AWS_INTEGRATION_IMAGE"])
    if (environment[name] === undefined || environment[name]!.trim() === "")
      throw new Error(`${name} is required when ZSYS_TEST_ALL_CLOUD=1.`);
  await runScript("test:aws-integration", {
    ...environment,
    ZSYS_AWS_INTEGRATION: "1",
  });
}

async function runScript(script: string, environment: NodeJS.ProcessEnv): Promise<void> {
  console.log(`\n▶ ${script}`);
  const child = Bun.spawn([process.execPath, "run", script], {
    cwd: root,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
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
