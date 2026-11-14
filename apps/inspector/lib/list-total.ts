/**
 * The count a paged list shows in its header. A number shown as a count is the count of matching
 * records, so a page that is only part of the list says so.
 * @param page - Records before this page, records on it, the total when the API reports one, and
 * whether another page follows.
 * @returns "20 of 23" for the first page, "21–23 of 23" for a later one, "3" for a list that
 * fits, and "20+" when no total is known and more follow.
 */
export function listTotalLabel(page: {
  readonly offset: number;
  readonly shown: number;
  readonly total?: number | undefined;
  readonly hasMore: boolean;
}): string {
  const { offset, shown, total, hasMore } = page;
  if (total === undefined) return hasMore ? `${shown}+` : String(shown);
  if (offset === 0) return shown >= total ? String(total) : `${shown} of ${total}`;
  return `${offset + 1}–${offset + shown} of ${total}`;
}
