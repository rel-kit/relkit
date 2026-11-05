/**
 * The checks the beta rehearsal runs against packed packages installed from its local
 * registry: creation (create a project with the packed `create-relkit` and run its `check`,
 * `typecheck`, `test` and `build`), runtime (serve the built project on Bun and on Node and
 * call its route), and the packed consumer on the final `@relkit/app` (a 0.8-style project that
 * builds on the deprecated package, shows its deprecation, then migrates with the packed
 * `relkit migrate`). Each step throws with the command's output when it fails.
 */
import { spawn } from "node:child_process";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Environment that points Bun and npm at the rehearsal registry. */
export type RegistryEnvironment = NodeJS.ProcessEnv;

/**
 * Runs a command and fails with its output on a non-zero exit.
 * @param command - Executable and arguments.
 * @param cwd - Working directory.
 * @param env - Environment with the registry settings.
 * @returns Combined stdout and stderr.
 */
export async function step(
  command: readonly string[],
  cwd: string,
  env: RegistryEnvironment,
): Promise<string> {
  console.log(`$ ${command.join(" ")}  (${cwd})`);
  // Asynchronous on purpose: the rehearsal registry answers from this same process.
  const child = spawn(command[0]!, command.slice(1), { cwd, env, stdio: "pipe" });
  let output = "";
  child.stdout.on("data", (chunk) => (output += String(chunk)));
  child.stderr.on("data", (chunk) => (output += String(chunk)));
  const status = await new Promise<number | null>((resolve) => child.once("close", resolve));
  if (status !== 0) throw new Error(`${command.join(" ")} failed (${status}):\n${output}`);
  return output;
}

/**
 * Creates a project from the packed `create-relkit` and runs its scripts.
 * @param root - Rehearsal folder.
 * @param env - Registry environment.
 * @param version - Beta version.
 * @param template - Starter template.
 * @returns The project folder.
 */
export async function creationSuite(
  root: string,
  env: RegistryEnvironment,
  version: string,
  template: string,
) {
  const name = `beta-${template}`;
  await step(
    ["bun", "x", "--bun", `create-relkit@${version}`, name, "--template", template, "--no-git"],
    root,
    env,
  );
  const app = join(root, name);
  for (const script of ["check", "typecheck", "test", "build"])
    await step(["bun", "run", script], app, env);
  return app;
}

/**
 * Serves the built project on Bun and on Node and calls its hello route.
 * @param app - Project created by `creationSuite`.
 * @param env - Registry environment.
 * @param port - Free port for the server.
 * @returns After both runtimes answered.
 */
export async function runtimeSuite(app: string, env: RegistryEnvironment, port: number) {
  await serve(["bun", "run", "start"], app, env, port);
  await step(["bun", "x", "relkit", "build", "--runtime", "node"], app, env);
  await serve(["node", ".relkit/build/server/index.js"], app, env, port);
}

/**
 * Starts a server, waits for `GET /hello?name=Beta`, and stops it.
 * @param command - Server command.
 * @param cwd - Project folder.
 * @param env - Environment.
 * @param port - Port the server listens on.
 * @returns After the greeting answered and the server exited.
 */
async function serve(
  command: readonly string[],
  cwd: string,
  env: RegistryEnvironment,
  port: number,
) {
  console.log(`$ ${command.join(" ")}  (PORT=${port})`);
  const child = spawn(command[0]!, command.slice(1), {
    cwd,
    env: { ...env, PORT: String(port) },
    stdio: "pipe",
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += String(chunk)));
  child.stderr.on("data", (chunk) => (output += String(chunk)));
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const body = await fetch(`http://127.0.0.1:${port}/hello?name=Beta`)
        .then((response) => (response.ok ? response.text() : undefined))
        .catch(() => undefined);
      if (body?.includes("Hello, Beta!")) return;
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`${command.join(" ")} did not answer GET /hello:\n${output}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) =>
      child.exitCode === null ? child.once("exit", resolve) : resolve(undefined),
    );
  }
}

/**
 * Builds a 0.8-style project on the final `@relkit/app`, then migrates it with the packed CLI.
 * @param created - A project from `creationSuite` to copy.
 * @param root - Rehearsal folder.
 * @param env - Registry environment.
 * @param version - Beta version.
 * @param deprecation - Message the registry must report for `@relkit/app`.
 * @param registry - Registry URL.
 * @returns After the legacy project built, migrated and built again.
 */
export async function legacyConsumerSuite(
  created: string,
  root: string,
  env: RegistryEnvironment,
  version: string,
  deprecation: string,
  registry: string,
) {
  const app = join(root, "legacy-app");
  await cp(created, app, {
    recursive: true,
    filter: (path) => !/\/(node_modules|\.relkit)(\/|$)/.test(path),
  });
  for (const path of [join(app, "relkit.config.ts"), ...(await sources(join(app, "src")))]) {
    const text = await readFile(path, "utf8");
    await writeFile(
      path,
      text
        .replaceAll('from "relkit/', 'from "@relkit/app/')
        .replaceAll('from "relkit"', 'from "@relkit/app"'),
    );
  }
  const manifestPath = join(app, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies = { "@relkit/app": version, ...manifest.dependencies };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const metadata = (await (await fetch(`${registry}/@relkit%2fapp`)).json()) as {
    versions: Record<string, { deprecated?: string }>;
  };
  if (metadata.versions[version]?.deprecated !== deprecation)
    throw new Error(`The registry does not report @relkit/app@${version} as deprecated.`);
  const install = await step(["bun", "install"], app, env);
  console.log(
    install.includes("deprecated")
      ? "bun install showed the deprecation."
      : "bun install does not print deprecations; the registry reports it.",
  );
  for (const script of ["check", "typecheck", "build"])
    await step(["bun", "run", script], app, env);
  const migrated = await step(["bun", "x", "relkit", "migrate", "--write"], app, env);
  if (!migrated.includes("Migrated."))
    throw new Error(`relkit migrate did not migrate:\n${migrated}`);
  await step(["bun", "install"], app, env);
  for (const script of ["check", "typecheck", "build"])
    await step(["bun", "run", script], app, env);
  const after = JSON.parse(await readFile(manifestPath, "utf8"));
  if (after.dependencies["@relkit/app"] !== undefined)
    throw new Error("relkit migrate kept @relkit/app.");
}

/**
 * Lists TypeScript sources below a folder.
 * @param folder - Folder.
 * @returns Absolute paths.
 */
async function sources(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}
