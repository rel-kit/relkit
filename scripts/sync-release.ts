import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const packageRoot = join(root, "packages");
const repository = "https://github.com/rel-kit/relkit";
const descriptions: Record<string, string> = {
  "@relkit/agents": "RELKIT agent authoring API; prefer @relkit/app/agents in applications.",
  "@relkit/app": "The primary typed application-authoring API for RELKIT.",
  "@relkit/better-auth": "Better Auth integration for RELKIT routes.",
  "@relkit/buckets": "RELKIT bucket authoring API; prefer @relkit/app/buckets in applications.",
  "@relkit/cache": "RELKIT cache authoring API; prefer @relkit/app/cache in applications.",
  "@relkit/cli": "The RELKIT development, build, inspection, and deployment CLI.",
  "@relkit/client-generator": "Unsupported internal RELKIT client generator; use @relkit/app.",
  "@relkit/client": "Typed RELKIT client helpers, including TanStack Query integration.",
  "@relkit/cloud-aws":
    "Unsupported internal AWS deployment components for RELKIT; use @relkit/cli.",
  "@relkit/compiler": "Unsupported internal RELKIT source compiler; use @relkit/cli.",
  "@relkit/config":
    "RELKIT environment configuration API; prefer @relkit/app/config in applications.",
  "@relkit/contracts": "Unsupported internal RELKIT contracts; use @relkit/app.",
  "@relkit/deploy-pulumi":
    "Unsupported internal Pulumi deployment engine for RELKIT; use @relkit/cli.",
  "@relkit/deploy": "Unsupported internal RELKIT deployment contracts; use @relkit/cli.",
  "@relkit/diagnostics": "Unsupported internal RELKIT diagnostics; use @relkit/cli.",
  "@relkit/drizzle": "Drizzle ORM integration for RELKIT functions.",
  "@relkit/engine": "Unsupported internal RELKIT execution engine; use @relkit/app.",
  "@relkit/events": "RELKIT event authoring API; prefer @relkit/app/events in applications.",
  "@relkit/functions":
    "RELKIT function authoring API; prefer @relkit/app/functions in applications.",
  "@relkit/graph": "Unsupported internal RELKIT graph model; use @relkit/app.",
  "@relkit/inspector-api": "Unsupported internal API for the RELKIT inspector; use @relkit/cli.",
  "@relkit/invocation": "Unsupported internal RELKIT invocation contracts; use @relkit/app.",
  "@relkit/jobs": "RELKIT job authoring API; prefer @relkit/app/jobs in applications.",
  "@relkit/observability": "Unsupported internal RELKIT observability contracts; use @relkit/app.",
  "@relkit/openapi": "Unsupported internal OpenAPI generator for RELKIT; use @relkit/cli.",
  "@relkit/providers-local": "Local runtime providers for RELKIT development and testing.",
  "@relkit/providers-standard": "Standard provider adapters for RELKIT applications.",
  "@relkit/routes": "RELKIT route authoring API; prefer @relkit/app/routes in applications.",
  "@relkit/runtime-effect": "Unsupported internal Effect runtime for RELKIT; use @relkit/app.",
  "@relkit/runtime-hono": "Unsupported internal Hono runtime for RELKIT; use @relkit/app.",
  "@relkit/schema": "RELKIT schema API; prefer @relkit/app/schema in applications.",
  "@relkit/services": "RELKIT service authoring API; prefer @relkit/app/services in applications.",
  "@relkit/supervisor": "Unsupported internal RELKIT process supervisor; use @relkit/cli.",
  "@relkit/testing": "Testing utilities and local providers for RELKIT applications.",
  "@relkit/tools": "RELKIT tool authoring API; prefer @relkit/app/tools in applications.",
  "create-relkit": "Create a RELKIT application from a supported project template.",
};
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const write = process.argv.includes("--write");
const stale: string[] = [];

async function syncJson(path: string, value: Record<string, unknown>): Promise<void> {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  if ((await readFile(path, "utf8")) === output) return;
  if (write) await writeFile(path, output);
  else stale.push(path);
}

const versions = new Set<string>();
for (const entry of (await readdir(packageRoot, { withFileTypes: true })).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory()) continue;
  const path = join(packageRoot, entry.name, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const name = String(manifest.name);
  const description = descriptions[name];
  if (description === undefined) throw new Error(`Missing release description for ${name}`);
  versions.add(String(manifest.version));
  const {
    name: _name,
    version,
    description: _description,
    license: _license,
    repository: _repository,
    homepage: _homepage,
    bugs: _bugs,
    files: _files,
    publishConfig: _publishConfig,
    engines: _engines,
    ...rest
  } = manifest;
  await syncJson(path, {
    name,
    version,
    description,
    license: "MIT",
    repository: { type: "git", url: `${repository}.git`, directory: `packages/${entry.name}` },
    homepage: `${repository}#readme`,
    bugs: { url: `${repository}/issues` },
    files: ["dist"],
    publishConfig: { access: "public" },
    engines: { bun: ">=1.3.10" },
    ...rest,
  });
}

if (versions.size !== 1)
  throw new Error(`Fixed package versions diverged: ${[...versions].join(", ")}`);
const version = [...versions][0]!;
for (const template of ["agent", "api", "minimal"]) {
  const path = join(root, "templates", "default", "v1", template, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
  for (const field of dependencyFields)
    for (const name of Object.keys(manifest[field] ?? {}))
      if (name.startsWith("@relkit/") || name === "create-relkit") manifest[field][name] = version;
  await syncJson(path, manifest);
}

const templateReadme = join(root, "templates", "default", "README.md");
const readme = await readFile(templateReadme, "utf8");
const nextReadme = readme.replace(
  /checked-in RelKit package version \(`[^`]+`\)/,
  `checked-in RelKit package version (\`${version}\`)`,
);
if (readme !== nextReadme) {
  if (write) await writeFile(templateReadme, nextReadme);
  else stale.push(templateReadme);
}

if (stale.length > 0)
  throw new Error(
    `Release metadata is stale; run bun run release:sync:\n${stale.map((path) => (basename(path) === "package.json" ? path.replace(`${root}/`, "") : path.replace(`${root}/`, ""))).join("\n")}`,
  );
