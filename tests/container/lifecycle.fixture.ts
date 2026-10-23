/** Owns isolated lifecycle source fixtures, exact artifact inventories and bounded runtime acknowledgement waits. */
import { access, cp, mkdir, mkdtemp, readFile, readdir, symlink } from "node:fs/promises";
import { join, relative } from "node:path";
export const ARTIFACTS = [
  ".dockerignore",
  "Dockerfile",
  "application.graph.json",
  "manifest.json",
  "openapi.json",
  "package.json",
  "server/index.js",
  "server/index.ts",
  "server/runtime-activation.json",
  "server/runtime-integrations.plan.json",
  "server/runtime-integrations.ts",
  "server/runtime.manifest.ts",
] as const;
export const roots: string[] = [];

/** @returns A fixture-owned copy of the minimal application with its existing workspace links. */
export async function copyProject(): Promise<string> {
  const root = await mkdtemp(join("/tmp", "relkit-container-test-"));
  roots.push(root);
  await cp(join(process.cwd(), "tests/compiler/fixtures/valid-minimal"), root, { recursive: true });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  await linkWorkspacePackages(root);
  return root;
}

/** @param root - Temporary source fixture root. @returns After linking the same runtime owners used by the original lifecycle suite. */
export async function linkWorkspacePackages(root: string): Promise<void> {
  const scope = join(root, "node_modules", "@relkit");
  await mkdir(scope, { recursive: true });
  for (const name of [
    "agents",
    "app",
    "buckets",
    "cache",
    "cloud-aws",
    "cli",
    "compiler",
    "config",
    "contracts",
    "diagnostics",
    "engine",
    "events",
    "functions",
    "graph",
    "inspector-api",
    "invocation",
    "jobs",
    "observability",
    "providers-local",
    "providers-standard",
    "routes",
    "runtime-effect",
    "runtime-hono",
    "schema",
    "services",
    "supervisor",
    "testing",
    "tools",
  ])
    await symlink(join(process.cwd(), "packages", name), join(scope, name));
}

/** @param buildDirectory - Generated production context. @returns The exact named artifact bytes used for reproducibility comparison. */
export async function readArtifacts(buildDirectory: string): Promise<Map<string, string>> {
  return new Map(
    await Promise.all(
      ARTIFACTS.map(
        async (path) => [path, await readFile(join(buildDirectory, path), "utf8")] as const,
      ),
    ),
  );
}

/** @param root - Artifact root. @param current - Recursive directory being inspected. @returns Sorted portable file paths beneath the build root. */
export async function filesIn(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(root, path)));
    else files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files.sort();
}

/** @param path - Runtime-owned acknowledgement file. @returns After its appearance within the original one-second deadline. */
export async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

/** @typeParam T - Original operation result. @param promise - Runtime exit or operation being observed. @param timeoutMs - Original bounded wait. @returns The unchanged operation result before its deadline. */
export async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Operation exceeded ${timeoutMs} ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** @returns The original in-flight cancellation and telemetry flush handler source. */
export function handlerSource(): string {
  return `import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const hello = defineFunction({
  id: "hello.say-hello",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async (input, context) => {
    const started = process.env.RELKIT_TEST_INFLIGHT_FILE;
    const flushed = process.env.RELKIT_TEST_FLUSH_FILE;
    const rejected = process.env.RELKIT_TEST_ADMISSION_FILE;
    const rejectionUrl = process.env.RELKIT_TEST_ADMISSION_URL_FILE;
    (globalThis as Record<string, unknown>)["__relkit_flush_telemetry"] = async () => {
      // The listener remains owned until this flush returns, making drain rejection observable.
      if (rejected !== undefined && rejectionUrl !== undefined) {
        const response = await fetch(await Bun.file(rejectionUrl).text());
        await Bun.write(rejected, response.status + ":" + await response.text());
      }
      if (flushed !== undefined) await Bun.write(flushed, "flushed");
    };
    if (started !== undefined) await Bun.write(started, "started");
    await new Promise<void>((resolve) => {
      if (context.signal.aborted) return resolve();
      context.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    const cancelled = process.env.RELKIT_TEST_CANCEL_FILE;
    if (context.signal.aborted && cancelled !== undefined) await Bun.write(cancelled, "cancelled");
    return { message: \`Hello, \${input.name}\` };
  },
});

export default hello;
`;
}
