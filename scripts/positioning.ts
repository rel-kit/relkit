/** Holds the one positioning sentence and fails when a public surface says something else. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const POSITIONING =
  "The TypeScript backend framework where you write the business logic. RelKit wires the APIs, jobs, events, agents and typed client, and gives you, and your coding agent, a live map of the app.";

/** Where a surface's text must match: the whole description, or a sentence inside a page region. */
export interface PositioningSurface {
  readonly name: string;
  readonly text: string | undefined;
  readonly match: "equals" | "contains";
}

const REPOSITORY = "rel-kit/relkit";

/**
 * Reads every checked-in surface: the README opening, the landing hero and its meta description,
 * the docs index hero and the npm descriptions of `relkit` and `create-relkit`.
 * @param root - Repository root. @returns Surfaces in a stable order.
 */
export async function readLocalSurfaces(root: string): Promise<PositioningSurface[]> {
  const read = (path: string) => readFile(join(root, path), "utf8");
  const description = async (path: string) =>
    (JSON.parse(await read(path)) as { description?: string }).description;
  const readme = await read("README.md");
  const hero = await read("apps/docs/components/landing/hero.tsx");
  const landing = await read("apps/docs/pages/index.astro");
  const docs = await read("apps/docs/content/docs/index.mdx");
  return [
    { name: "README opening", text: between(readme, "\n", "\n## "), match: "contains" },
    {
      name: "landing hero",
      text: plain(between(hero, "<Heading", "</motion.p>")),
      match: "contains",
    },
    {
      name: "landing description",
      text: /const description = "([^"]*)";/u.exec(landing)?.[1],
      match: "equals",
    },
    { name: "docs index", text: between(docs, "<DocsHero>", "</DocsHero>"), match: "contains" },
    {
      name: "npm description of relkit",
      text: await description("packages/relkit/package.json"),
      match: "equals",
    },
    {
      name: "npm description of create-relkit",
      text: await description("packages/create-relkit/package.json"),
      match: "equals",
    },
  ];
}

/**
 * Reads the GitHub repository description, authenticated when `GITHUB_TOKEN` is set.
 * @returns The description surface; a failed request throws.
 */
export async function readGitHubSurface(): Promise<PositioningSurface> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}`, {
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok)
    throw new Error(`Could not read the GitHub description of ${REPOSITORY}: ${response.status}`);
  const { description } = (await response.json()) as { description: string | null };
  return { name: "GitHub description", text: description ?? undefined, match: "equals" };
}

/**
 * Lists the surfaces that do not use the positioning sentence.
 * @param surfaces - Surfaces to compare. @param sentence - Expected sentence.
 * @returns The names of mismatched surfaces, in input order.
 */
export function positioningMismatches(
  surfaces: readonly PositioningSurface[],
  sentence = POSITIONING,
): string[] {
  return surfaces
    .filter(({ text, match }) => {
      if (text === undefined) return true;
      const actual = normalize(text);
      return match === "equals" ? actual !== sentence : !actual.includes(sentence);
    })
    .map(({ name }) => name);
}

function between(text: string, start: string, end: string): string | undefined {
  const from = text.indexOf(start);
  if (from < 0) return undefined;
  const to = text.indexOf(end, from + start.length);
  return to < 0 ? undefined : text.slice(from + start.length, to);
}

function plain(markup: string | undefined): string | undefined {
  return markup?.replace(/^[^>]*>/u, "").replace(/<[^>]*>/gu, " ");
}

function normalize(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const skipGitHub = process.argv.includes("--skip-github");
  const surfaces = [
    ...(await readLocalSurfaces(root)),
    ...(skipGitHub ? [] : [await readGitHubSurface()]),
  ];
  const mismatches = positioningMismatches(surfaces);
  if (mismatches.length > 0) {
    console.error(
      `These surfaces do not use the positioning sentence from scripts/positioning.ts: ${mismatches.join(", ")}.\nExpected: ${POSITIONING}`,
    );
    process.exit(1);
  }
  console.log(JSON.stringify({ protocol: "relkit.positioning", surfaces: surfaces.length }));
}
