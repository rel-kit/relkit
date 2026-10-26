/**
 * Owns documentation generation and freshness checks for guides, install recipes,
 * CLI and API references. Producers return content; this boundary formats and
 * writes owned files, preserving authored pages and reporting stale outputs.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { Effect } from "effect";
import { format } from "prettier";
import { getCliHelpModel, type CliHelpCommand } from "@relkit/cli/help";
import { apiPackageDefinitions } from "./documentation-catalog.js";
import { renderApi } from "./generate-api.js";
import { generateGuides } from "./generate-guides.js";
import { generateInstallations } from "./generate-installations.js";
import { contentFiles, pruneGenerated } from "./generation-files.js";
import { generateSourceSnippets } from "./source-snippets.js";
import { referenceOverview } from "./api-related.js";
import {
  publicApiInventory,
  supportingSources,
  newlyDocumentedSources,
} from "./public-api-inventory.js";
import { contractIndex, missingContracts } from "./public-api-contracts.js";
import { publicDirectory, publicExports } from "./public-api-pages.js";

const root = resolve(import.meta.dir, "../../..");
const content = resolve(import.meta.dir, "../content");
const checkOnly = process.argv.includes("--check");
const expected = new Set<string>();
const apiConcurrency = Number(process.env.RELKIT_DOCGEN_CONCURRENCY ?? "6");
if (!Number.isInteger(apiConcurrency) || apiConcurrency < 1 || apiConcurrency > 6)
  throw new Error("RELKIT_DOCGEN_CONCURRENCY must be an integer from 1 to 6.");
/** Runs every owned producer, or the explicitly selected CLI-only path.
 * @returns Completion after all generated outputs are written or checked.
 */
async function main(): Promise<void> {
  const cliPackage = JSON.parse(
    await readFile(resolve(root, "packages/cli/package.json"), "utf8"),
  ) as { readonly version: string };
  const cliModel = getCliHelpModel(cliPackage.version);
  if (process.argv.includes("--cli-only")) {
    await emit("docs/api/cli.mdx", renderCliReference(cliModel));
    return;
  }
  await generateGuides(root, content, cliModel, emit);
  await generateInstallations(root, emit);
  await emit("_snippets/generated/api-overview.mdx", referenceOverview());
  await emit("docs/api/cli.mdx", renderCliReference(cliModel));
  const pages = (await contentFiles(content)).filter(
    (path) =>
      /\.mdx?$/.test(path) &&
      !path.includes("/_snippets/") &&
      !path.includes("/generated/") &&
      !path.includes("/api/"),
  );
  await generateSourceSnippets(root, pages, emit);
  if (process.argv.includes("--content-only")) {
    for (const { slug } of apiPackageDefinitions) {
      expected.add(resolve(content, `docs/api/${slug}.mdx`));
      expected.add(resolve(content, `_snippets/generated/exports/${slug}.mdx`));
    }
    expected.add(resolve(content, "docs/api/public.mdx"));
  } else await generateApis();
  await pruneGenerated(content, expected, checkOnly);
  console.log(
    checkOnly ? "Generated documentation is current." : "Generated documentation updated.",
  );
}

/** Runs bounded source API generation, including docgen's executable example checks.
 * @returns Completion after all API references match their source. */
async function generateApis(): Promise<void> {
  const inventory = publicApiInventory(root);
  const pages = new Map<string, string>();
  for (let start = 0; start < apiPackageDefinitions.length; start += apiConcurrency) {
    const results = await Promise.allSettled(
      apiPackageDefinitions.slice(start, start + apiConcurrency).map(async (definition) => {
        const page = await renderApi(
          definition,
          undefined,
          supportingSources(inventory, definition.slug),
          newlyDocumentedSources(inventory, definition.slug),
        );
        pages.set(definition.slug, page);
        await emit(`docs/api/${definition.slug}.mdx`, page);
      }),
    );
    for (const result of results) if (result.status === "rejected") throw result.reason;
  }
  const contracts = contractIndex(pages);
  const missing = missingContracts(inventory, contracts);
  if (missing.length) throw new Error(`Missing public API contracts:\n${missing.join("\n")}`);
  for (const { slug, packageName } of apiPackageDefinitions)
    await emit(
      `_snippets/generated/exports/${slug}.mdx`,
      publicExports(
        inventory.filter((entry) => !entry.internal && entry.packageName === packageName),
        contracts,
      ),
    );
  await emit("docs/api/public.mdx", publicDirectory(inventory));
}

/** Renders the public help model as the canonical CLI reference.
 * @param model - Current CLI commands and independently versioned owner.
 * @returns Complete MDX reference source.
 */
function renderCliReference(model: ReturnType<typeof getCliHelpModel>): string {
  return `---\ntitle: CLI reference\ndescription: Generated command, argument, flag, and example reference for relkit ${model.version}.\nsearch:\n  exclude: true\nsidebar:\n  icon: terminal\n---\n\n{/* Generated by apps/docs/scripts/generate.ts. Do not edit. */}\n\nFor guided setup and everyday workflows, start with the [CLI module](/docs/modules/cli) or follow [Create and build an API](/guides/cli/create-and-build-an-api). This page lists exact command arguments and options.\n\nThe command model below is shared with the Effect CLI runtime, so nested help and this page cannot drift.\n\n${renderCommand(model, 2)}\n`;
}

/** Renders a command and its nested help without duplicating CLI definitions.
 * @param command - Native help node.
 * @param depth - Current Markdown heading depth.
 * @returns Ordered command, arguments, flags, examples and child sections.
 */
function renderCommand(command: CliHelpCommand, depth: number): string {
  const heading = "#".repeat(Math.min(depth, 6));
  const sections = [
    `${heading} \`${command.usage}\`\n\n${command.description}`,
    command.arguments.length
      ? table(
          "Argument",
          command.arguments.map((item) => [
            item.name,
            item.required ? "required" : "optional",
            item.description,
          ]),
        )
      : "",
    command.options.length
      ? table(
          "Option",
          command.options.map((item) => [
            `--${item.name}${item.aliases?.length ? ` / ${item.aliases.map((alias) => `--${alias}`).join(" / ")}` : ""}`,
            item.values?.join(", ") ?? item.type,
            item.description,
          ]),
        )
      : "",
    command.examples.length
      ? `${heading}# Examples\n\n${command.examples.map((example) => `\`${example.command}\` — ${example.description}`).join("\n\n")}`
      : "",
    ...command.commands.map((child) => renderCommand(child, depth + 1)),
  ];
  return sections.filter(Boolean).join("\n\n");
}

/** Formats escaped help values into a three-column Markdown table.
 * @param first - First column's role label.
 * @param rows - Literal help values.
 * @returns A Markdown table preserving row order.
 */
function table(first: string, rows: readonly (readonly string[])[]): string {
  return `| ${first} | Value | Description |\n| --- | --- | --- |\n${rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`).join("\n")}`;
}

/** Protects help strings from breaking their Markdown table cell.
 * @param value - Literal help text.
 * @returns Pipe-escaped single-line text.
 */
function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** Formats and writes one owned artifact, or fails on any stale checked bytes.
 * @param path - Output relative to the documentation content root.
 * @param value - Producer-owned Markdown or JSON.
 * @returns Completion after the file matches the deterministic formatter output.
 */
async function emit(path: string, value: string): Promise<void> {
  const destination = resolve(content, path);
  expected.add(destination);
  const options = {
    parser: path.endsWith(".json") ? "json" : path.endsWith(".ts") ? "typescript" : "mdx",
    printWidth: 100,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
  } as const;
  const formatted = path.startsWith("_snippets/source/")
    ? value
    : await format(await format(value, options), options);
  if (checkOnly) {
    const current = await readFile(destination, "utf8").catch(() => undefined);
    if (current !== formatted)
      throw new Error(`Generated documentation is stale: ${relative(root, destination)}`);
    return;
  }
  await mkdir(resolve(destination, ".."), { recursive: true });
  await writeFile(destination, formatted);
  if (!basename(destination).includes("meta"))
    console.log(`generated ${relative(root, destination)}`);
}

await Effect.runPromise(Effect.tryPromise(main));
