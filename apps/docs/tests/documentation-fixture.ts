/** Reads native documentation inventories without acquiring application resources. */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Enumerates authored and generated Markdown beneath one documentation root.
 * @param directory - Existing documentation root.
 * @returns Markdown paths in native directory order.
 */
export async function markdownFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownFiles(path)));
    else if (/\.mdx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/**
 * Lists immediate TypeScript files used by landing examples.
 * @param directory - Existing example directory.
 * @returns Authored TypeScript paths.
 */
export async function sourceFiles(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(directory, entry.name));
}
