import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const content = resolve(import.meta.dir, "../content/docs");
const files = await markdownFiles(content);
const missingMetadata: string[] = [];
const indexedText: string[] = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!frontmatter || !/^title: .+/m.test(frontmatter) || !/^description: .+/m.test(frontmatter))
    missingMetadata.push(file);
  indexedText.push(text);
}

if (missingMetadata.length)
  throw new Error(`Pages missing searchable title/description:\n${missingMetadata.join("\n")}`);
const index = indexedText.join("\n");
for (const term of ["defineRoute", "onEvent", "zsys graph diff", "defineAgent", "Scalar"]) {
  if (!index.includes(term)) throw new Error(`Search corpus is missing required term: ${term}`);
}
const route = await readFile(resolve(import.meta.dir, "../app/api/search/route.ts"), "utf8");
if (!route.includes("createFromSource(source)"))
  throw new Error("Search route is not source-backed");
console.log(`Validated metadata and search corpus for ${files.length} pages.`);

async function markdownFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownFiles(path)));
    else if (/\.mdx?$/.test(entry.name)) found.push(path);
  }
  return found;
}
