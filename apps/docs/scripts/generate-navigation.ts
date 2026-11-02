/** Shares catalog ordering between generated metadata and the site-wide Blume sidebar. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SidebarDisplay, SidebarItemConfig } from "blume/schema";
import { apiPackageDefinitions } from "./documentation-catalog.js";
import { guideGroups } from "./guide-catalog.js";
import type { Emit } from "./generation.types.js";

const groups = [
  {
    directory: "docs",
    title: "Documentation",
    icon: "book-open",
    pages: ["index", "why-relkit", "faq", "maturity", "learn", "modules", "api", "errors"],
    display: "flat",
  },
  {
    directory: "docs/modules",
    title: "Modules",
    icon: "blocks",
    pages: [
      "index",
      "service",
      "http",
      "database",
      "auth",
      "storage",
      "caching",
      "events",
      "jobs",
      "client",
      "realtime",
      "integrations",
      "deployment",
      "operations",
      "cli",
      "ai",
    ],
    display: "page",
  },
  {
    directory: "guides",
    title: "Guides",
    icon: "book-open",
    pages: [
      "index",
      "migrate",
      "cli",
      "frontend",
      "storage",
      "caching",
      "events",
      "database",
      "auth",
      "ai",
    ],
    display: "flat",
  },
  ...guideGroups.map(({ directory, title, icon, pages }) => ({
    directory,
    title,
    icon: icon.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
    pages,
    display: directory.startsWith("guides/") || directory === "docs/learn" ? "flat" : "page",
  })),
  {
    directory: "docs/api",
    title: "Reference",
    icon: "braces",
    pages: [
      "index",
      "public",
      "cli",
      ...apiPackageDefinitions.filter(({ group }) => group === "core").map(({ slug }) => slug),
      "integrations",
    ],
    display: "flat",
  },
  {
    directory: "docs/api/integrations",
    title: "Integrations",
    icon: "plug",
    pages: apiPackageDefinitions
      .filter(({ group }) => group === "integrations")
      .map(({ slug }) => slug.replace("integrations/", "")),
    display: "page",
  },
];

const content = fileURLToPath(new URL("../content", import.meta.url));

/** Reads the frontmatter of a page that sets `labs: true`, so its sidebar row carries the badge.
 * @param route - Page route without the leading slash.
 * @returns The page's sidebar label and icon, or undefined for a Core page. */
function labsPage(route: string): { label: string; icon?: string } | undefined {
  const file = [`${route}.mdx`, `${route}/index.mdx`]
    .map((path) => resolve(content, path))
    .find(existsSync);
  const meta = file && /^---\n([\s\S]*?)\n---/u.exec(readFileSync(file, "utf8"))?.[1];
  if (!meta || !/^labs:\s*true\s*$/mu.test(meta)) return undefined;
  const value = (pattern: RegExp) =>
    pattern
      .exec(meta)?.[1]
      ?.trim()
      .replace(/^"(.*)"$/u, "$1");
  const icon = value(/^ {2}icon:\s*(.+)$/mu);
  return {
    label: value(/^ {2}label:\s*(.+)$/mu) ?? value(/^title:\s*(.+)$/mu) ?? route,
    ...(icon ? { icon } : {}),
  };
}

/** Builds one catalog group, linking its overview once through the group heading.
 * @param directory - Content directory or leaf page slug.
 * @returns A native Blume group or page route, preserving catalog order; Labs pages and
 * groups whose overview is a Labs page carry a "Labs" badge. */
function sidebarItem(directory: string): SidebarItemConfig {
  const group = groups.find((item) => item.directory === directory);
  if (!group) {
    const labs = labsPage(directory);
    return labs ? { ...labs, root: `/${directory}`, badge: "Labs" } : `/${directory}`;
  }
  const hasIndex = group.pages.some((page) => page === "index");
  return {
    label: group.title,
    icon: group.icon,
    ...(hasIndex ? { root: `/${directory}` } : {}),
    ...(hasIndex && labsPage(directory) ? { badge: "Labs" } : {}),
    display: group.display as SidebarDisplay,
    items: group.pages
      .filter((page) => page !== "index")
      .map((page) => sidebarItem(`${directory}/${page}`)),
  };
}

type SidebarGroup = Exclude<SidebarItemConfig, string>;

/** Reads one catalog group's rows, which always exist for a known directory.
 * @param directory - Content directory owning the group. @returns Its configured rows. */
function groupItems(directory: string): SidebarItemConfig[] {
  return (sidebarItem(directory) as SidebarGroup).items ?? [];
}

/** Builds a top-level section that renders as an always-open heading, like the ew docs.
 * @param directory - Content directory owning the section.
 * @param items - Section rows; defaults to the catalog order. @returns A flat Blume group. */
function section(directory: string, items = groupItems(directory)): SidebarGroup {
  return { ...(sidebarItem(directory) as SidebarGroup), display: "flat", items };
}

const coreReference = new Set(
  apiPackageDefinitions
    .filter(({ group }) => group === "core")
    .map(({ slug }) => `/docs/api/${slug}`),
);
/** Tells a page row (a route, or a badged Labs page) from a group of rows.
 * @param item - Sidebar row. @returns Whether the row links a single page. */
function isPage(item: SidebarItemConfig): boolean {
  return typeof item === "string" || item.items === undefined;
}

/** Reads the route a page row links. @param item - Page row. @returns Its route. */
function pageRoute(item: SidebarItemConfig): string | undefined {
  return typeof item === "string" ? item : item.root;
}

const referencePages = groupItems("docs/api").filter(isPage);
const isCoreReference = (item: SidebarItemConfig) => coreReference.has(pageRoute(item) ?? "");

/**
 * Header tabs scope this tree: the root "Docs" tab shows the groups no other tab owns, while
 * the Guides and Reference tabs match their section's `root` and show only its rows.
 */
export const documentationSidebar: SidebarItemConfig[] = [
  "/docs",
  "/docs/why-relkit",
  "/docs/faq",
  "/docs/maturity",
  section("docs/learn", groupItems("docs/learn").filter(isPage)),
  section("docs/learn/concepts"),
  section("docs/modules"),
  section("guides"),
  section("docs/api", [
    ...referencePages.filter((page) => !isCoreReference(page)),
    {
      label: "Core packages",
      icon: "package",
      display: "flat",
      items: referencePages.filter(isCoreReference),
    },
    section("docs/api/integrations"),
  ]),
  "/docs/errors",
];

/** Emits ordered section and module navigation without maintaining a second tree.
 * @param emit - Owned output writer/checker. @returns Completion after all metadata. */
export async function emitNavigation(emit: Emit): Promise<void> {
  for (const { directory, ...meta } of groups) {
    await emit(
      `${directory}/meta.ts`,
      `// Generated by apps/docs/scripts/generate.ts. Do not edit.\nimport { defineMeta } from "blume";\nexport default defineMeta(${JSON.stringify(meta)});\n`,
    );
  }
}
