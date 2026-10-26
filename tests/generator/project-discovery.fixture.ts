/** Shares the original deterministic fixture constants and helpers across cohesive project-discovery cases. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export async function withProject(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-discovery-"));
  try {
    await write(root, "package.json", `{ "name": "test", "type": "module" }\n`);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content);
}
