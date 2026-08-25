import { cx } from "./cx";

export function cn(...values: readonly (string | false | null | undefined)[]): string {
  return cx(...values);
}
