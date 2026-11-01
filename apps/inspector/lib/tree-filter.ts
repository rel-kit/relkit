/** Search over a two-level tree (group → leaves), shared by the tree explorer views. */

export interface TreeLeafData {
  readonly id: string;
  readonly label: string;
  /** Extra words that should match search but are not displayed as the label. */
  readonly keywords?: string;
}

export interface TreeGroupData<Leaf extends TreeLeafData = TreeLeafData> {
  readonly id: string;
  readonly label: string;
  readonly children: readonly Leaf[];
}

export interface FilteredTreeGroup<Leaf extends TreeLeafData> {
  readonly group: TreeGroupData<Leaf>;
  readonly children: readonly Leaf[];
  /** True when the query matched leaves inside, so the group should open. */
  readonly matchedInside: boolean;
}

/**
 * Keeps groups whose label matches (with all their leaves) and groups with matching leaves
 * (with only those leaves). An empty query keeps everything and opens nothing.
 */
export function filterTree<Leaf extends TreeLeafData>(
  groups: readonly TreeGroupData<Leaf>[],
  query: string,
): readonly FilteredTreeGroup<Leaf>[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle)
    return groups.map((group) => ({ group, children: group.children, matchedInside: false }));
  return groups.flatMap((group): FilteredTreeGroup<Leaf>[] => {
    if (group.label.toLocaleLowerCase().includes(needle))
      return [{ group, children: group.children, matchedInside: false }];
    const children = group.children.filter((leaf) =>
      `${leaf.label} ${leaf.id} ${leaf.keywords ?? ""}`.toLocaleLowerCase().includes(needle),
    );
    return children.length === 0 ? [] : [{ group, children, matchedInside: true }];
  });
}

/** Splits text around case-insensitive matches so the view can wrap them in <mark>. */
export function highlightParts(
  text: string,
  query: string,
): readonly { readonly text: string; readonly match: boolean }[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  // Matching on the original text keeps indices valid; lowercasing can change a string's length.
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const parts: { text: string; match: boolean }[] = [];
  let index = 0;
  for (const found of text.matchAll(pattern)) {
    if (found.index > index) parts.push({ text: text.slice(index, found.index), match: false });
    parts.push({ text: found[0], match: true });
    index = found.index + found[0].length;
  }
  if (index < text.length || parts.length === 0)
    parts.push({ text: text.slice(index), match: false });
  return parts;
}
