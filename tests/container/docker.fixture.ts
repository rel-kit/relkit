/** Small Docker and HTTP polling helpers shared by the production image tests. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Manifest = { name: string; version: string; dependencies?: Record<string, string> };

/**
 * Makes a production build context install first-party packages from this checkout. The
 * release pull request versions them before they reach npm, so the registry cannot serve
 * them yet: each selected workspace package and its first-party closure is packed into
 * `vendor/` and pinned with a `file:` dependency and override.
 * @param buildDirectory - Generated production context.
 * @returns After the context, Dockerfile and ignore list use the vendored archives.
 */
export async function vendorWorkspacePackages(buildDirectory: string): Promise<void> {
  const workspace = await workspaceManifests();
  const path = join(buildDirectory, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as Manifest & {
    overrides?: Record<string, string>;
  };
  const pending = Object.keys(manifest.dependencies ?? {}).filter((name) => workspace.has(name));
  const closure = new Set<string>();
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (closure.has(name)) continue;
    closure.add(name);
    for (const dependency of Object.keys(workspace.get(name)!.manifest.dependencies ?? {}))
      if (workspace.has(dependency)) pending.push(dependency);
  }
  if (closure.size === 0) return;
  const vendor = join(buildDirectory, "vendor");
  await mkdir(vendor, { recursive: true });
  const overrides: Record<string, string> = { ...manifest.overrides };
  for (const name of [...closure].sort()) {
    const source = workspace.get(name)!;
    const before = new Set(await readdir(vendor));
    const pack = Bun.spawnSync(["bun", "pm", "pack", "--destination", vendor, "--quiet"], {
      cwd: source.directory,
      stdout: "pipe",
      stderr: "pipe",
    });
    const archive = (await readdir(vendor)).find((file) => !before.has(file));
    if (pack.exitCode !== 0 || archive === undefined)
      throw new Error(`Packing ${name} failed: ${pack.stderr.toString()}`);
    overrides[name] = `file:./vendor/${archive}`;
    if (manifest.dependencies?.[name] !== undefined) manifest.dependencies[name] = overrides[name];
  }
  await writeFile(path, `${JSON.stringify({ ...manifest, overrides }, null, 2)}\n`);
  const dockerfile = join(buildDirectory, "Dockerfile");
  await writeFile(
    dockerfile,
    (await readFile(dockerfile, "utf8")).replaceAll(
      "COPY package.json ./\n",
      "COPY package.json ./\nCOPY vendor/ ./vendor/\n",
    ),
  );
  const ignore = join(buildDirectory, ".dockerignore");
  await writeFile(ignore, `${await readFile(ignore, "utf8")}!vendor/\n!vendor/**\n`);
}

/** @returns Publishable workspace package manifests and directories by package name. */
async function workspaceManifests() {
  const packages = new Map<string, { directory: string; manifest: Manifest }>();
  for (const parent of ["packages", "integrations/packages"])
    for (const entry of await readdir(join(process.cwd(), parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(process.cwd(), parent, entry.name);
      const text = await readFile(join(directory, "package.json"), "utf8").catch(() => undefined);
      if (text === undefined) continue;
      const manifest = JSON.parse(text) as Manifest & { private?: boolean };
      if (manifest.private !== true) packages.set(manifest.name, { directory, manifest });
    }
  return packages;
}

/**
 * Runs one Docker command with inherited output.
 * @param args - Docker arguments.
 * @returns Exit code.
 */
export async function docker(args: readonly string[]): Promise<number> {
  const child = Bun.spawn(["docker", ...args], { stdout: "ignore", stderr: "inherit" });
  return child.exited;
}

/**
 * Runs one Docker command and captures its standard output.
 * @param args - Docker arguments.
 * @returns Trimmed standard output.
 */
export async function dockerOutput(args: readonly string[]): Promise<string> {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(child.stdout).text();
  await child.exited;
  return text.trim();
}

/**
 * Reads a container's combined log output.
 * @param name - Container name.
 * @returns Standard output and standard error.
 */
export async function containerLogs(name: string): Promise<string> {
  const child = Bun.spawn(["docker", "logs", name], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  return out + err;
}

/** @returns A random high port for a published container port. */
export function freePort(): number {
  return 30_000 + Math.floor(Math.random() * 20_000);
}

/**
 * Polls a URL until it answers with the expected status.
 * @param url - Probe URL.
 * @param status - Expected status.
 * @param attempts - Half-second attempts; one minute by default.
 * @returns Whether the status was observed.
 */
export async function waitForStatus(url: string, status: number, attempts = 120): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const observed = await fetch(url).then(
      (response) => response.status,
      () => 0,
    );
    if (observed === status) return true;
    await Bun.sleep(500);
  }
  return false;
}
