/** Packs real workspace artifacts into an isolated consumer and always removes its owned files. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const execute = promisify(execFile);

/** @typeParam Result - Consumer assertion result. @param packages - Exact packed package names. @param run - Consumer assertions. @param candidate - Optional verified final release directory; never repacks when supplied. @returns Assertion result after its temporary consumer is removed. */
export async function withPackedConsumer<Result>(
  packages: readonly string[],
  run: (root: string) => Promise<Result>,
  candidate = process.env.RELKIT_STORAGE_CANDIDATE,
): Promise<Result> {
  const root = await mkdtemp("/tmp/relkit-storage-owner-packed-");
  try {
    if (candidate !== undefined) {
      const evidence = await packedCommand(
        [
          "bun",
          resolve(import.meta.dirname, "../../..", "scripts/prepare-packed-storage-consumer.ts"),
          resolve(candidate),
          root,
          ...packages,
        ],
        root,
      );
      console.info(evidence.trim());
      return await run(root);
    }
    await installWorkspaceArchives(packages, root);
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Installs only explicitly self-packed workspace archives when no candidate was supplied. */
async function installWorkspaceArchives(packages: readonly string[], root: string): Promise<void> {
  const tarballs: Record<string, string> = {};
  for (const name of packages) {
    const destination = join(root, name);
    await mkdir(destination);
    await packedCommand(
      ["bun", "pm", "pack", "--ignore-scripts", "--destination", destination, "--quiet"],
      resolve(import.meta.dirname, "../..", name),
    );
    const archive = (await readdir(destination)).find((file) => file.endsWith(".tgz"));
    if (!archive) throw new Error(`No packed archive for ${name}`);
    tarballs[`@relkit/${name}`] = `file:${join(destination, archive)}`;
  }
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: tarballs,
      overrides: tarballs,
    }),
  );
  await packedCommand(
    [
      "bun",
      "install",
      "--ignore-scripts",
      "--network-concurrency",
      "1",
      "--concurrent-scripts",
      "1",
    ],
    root,
  );
}

/** @param command - Exact executable and arguments. @param cwd - Isolated consumer directory. @returns Captured stdout after bounded process completion. */
export async function packedCommand(command: readonly string[], cwd: string): Promise<string> {
  const [executable, ...args] = command;
  if (!executable) throw new Error("Packed consumer command is empty");
  const pending = execute(executable, args, { cwd, timeout: 60_000, maxBuffer: 1024 * 1024 });
  const reap = setTimeout(() => pending.child.kill("SIGKILL"), 62_000);
  try {
    return (await pending).stdout;
  } finally {
    clearTimeout(reap);
  }
}
