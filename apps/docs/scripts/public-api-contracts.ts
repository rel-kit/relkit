/** Joins real exports to native docgen sections using source identity and Blume's exact anchors. */
import { extractHeadings } from "blume/core/sources/normalize.ts";
import type { PublicImport, PublicSymbol, SymbolContract } from "./public-api.types.js";

/** Indexes native contracts without guessing duplicate heading suffixes or treating fences as headings.
 * @param pages - Native reference bodies keyed by route slug. @returns Source/name lookup. */
export function contractIndex(pages: ReadonlyMap<string, string>): Map<string, SymbolContract> {
  const contracts = new Map<string, SymbolContract>();
  for (const [slug, page] of pages) {
    const markdown = page.replace(/^---\n[\s\S]*?\n---\n/, "");
    const headings = extractHeadings(markdown);
    let current: (typeof headings)[number] | undefined;
    let body = "";
    let offset = 0;
    let fence = "";
    const save = (): void => {
      if (current?.depth !== 3) return;
      const source = body.match(
        /\[Source\]\(https:\/\/github\.com\/rel-kit\/relkit\/blob\/main\/([^#)]+)#L\d+\)/,
      )?.[1];
      const name = current.text.replace(
        / \((?:type alias|interface|class|namespace export)\)$/,
        "",
      );
      if (source)
        contracts.set(`${source}:${name}`, {
          href: `/docs/api/${slug}#${current.slug}`,
          example: body.includes("**Example**"),
        });
    };
    for (const line of markdown.split("\n")) {
      const marker = line.match(/^(`{3,}|~{3,})/)?.[1];
      if (
        marker &&
        fence &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        line.trim() === marker
      )
        fence = "";
      else if (marker && !fence) fence = marker;
      if (!fence && /^#{1,6} /.test(line)) {
        save();
        current = headings[offset++];
        body = "";
      } else body += `${line}\n`;
    }
    save();
  }
  return contracts;
}

/** Resolves aliases to their declaration; external re-exports retain the local facade contract.
 * @param entry - Public import being documented. @param symbol - Exported declaration.
 * @param contracts - Native contract index. @returns Exact native contract, or undefined for a gap. */
export function symbolContract(
  entry: PublicImport,
  symbol: PublicSymbol,
  contracts: ReadonlyMap<string, SymbolContract>,
): SymbolContract | undefined {
  return (
    contracts.get(`${symbol.source}:${symbol.original}`) ??
    contracts.get(`${entry.source}:${symbol.name}`)
  );
}

/** Reports any real public symbol that lacks a reachable generated contract.
 * @param inventory - All supported and internal import paths. @param contracts - Generated contracts.
 * @returns Actionable source/import gaps; empty means all supported names resolve. */
export function missingContracts(
  inventory: readonly PublicImport[],
  contracts: ReadonlyMap<string, SymbolContract>,
): string[] {
  return inventory
    .filter(({ internal }) => !internal)
    .flatMap((entry) =>
      entry.symbols
        .filter((symbol) => !symbolContract(entry, symbol, contracts))
        .map((symbol) => `${entry.specifier}: ${symbol.name} (${symbol.source}:${symbol.line})`),
    );
}
