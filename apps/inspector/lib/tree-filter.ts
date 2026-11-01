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
  const lower = text.toLocaleLowerCase();
  const target = needle.toLocaleLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let index = 0;
  while (index < text.length) {
    const found = lower.indexOf(target, index);
    if (found < 0) {
      parts.push({ text: text.slice(index), match: false });
      break;
    }
    if (found > index) parts.push({ text: text.slice(index, found), match: false });
    parts.push({ text: text.slice(found, found + target.length), match: true });
    index = found + target.length;
  }
  return parts;
}
