import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const content = resolve(import.meta.dir, "../content/docs");
const files = await markdownFiles(content);
const pages = new Set(
  files.map((file) => {
    const path = file.slice(content.length + 1, -extname(file).length);
    return `/docs/${path.replace(/\/index$/, "")}`.replace(/\/$/, "");
  }),
);
pages.add("/docs");
const missing: string[] = [];

for (const file of files) {
  const markdown = await readFile(file, "utf8");
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1]!.split("#", 1)[0]!;
    if (!target.startsWith("/docs")) continue;
    if (!pages.has(target.replace(/\/$/, ""))) missing.push(`${file}: ${target}`);
  }
}

if (missing.length) throw new Error(`Broken documentation links:\n${missing.join("\n")}`);
console.log(`Checked ${files.length} documentation pages for internal links.`);

async function markdownFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownFiles(path)));
    else if (/\.mdx?$/.test(entry.name)) found.push(path);
  }
  return found;
}
