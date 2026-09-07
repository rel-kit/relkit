import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveTemplateRoot(context: {
  readonly cwd?: string;
  readonly templateRoot?: string;
}): string {
  if (context.templateRoot !== undefined) return resolve(context.templateRoot);
  const packaged = fileURLToPath(new URL("./templates/default/v1", import.meta.url));
  if (existsSync(packaged)) return resolve(packaged);
  const source = fileURLToPath(new URL("../../../templates/default/v1", import.meta.url));
  if (existsSync(source)) return resolve(source);
  return resolve(context.cwd ?? process.cwd(), "templates/default/v1");
}
