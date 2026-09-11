import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readPublicFingerprint(root = process.cwd()): string {
  const path = resolve(root, ".relkit/generated/client-manifest.json");
  const value = JSON.parse(readFileSync(path, "utf8")) as { publicFingerprint?: unknown };
  if (typeof value.publicFingerprint !== "string") {
    throw new TypeError(`Relkit client manifest at ${path} has no public fingerprint.`);
  }
  return value.publicFingerprint;
}
