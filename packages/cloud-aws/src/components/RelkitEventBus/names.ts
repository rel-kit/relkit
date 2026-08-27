import { boundedAwsName } from "../common.js";

export function childResourceName(
  componentName: string,
  id: string,
  kind: string,
  maxLength = 255,
): string {
  const normalized = `${componentName}-${id}-${kind}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return boundedAwsName(normalized, maxLength);
}
