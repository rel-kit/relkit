import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { artifactFiles } from "./secret-scan-files.ts";

export const SYNTHETIC_SECRETS = Object.freeze({
  password: "super-secret-password",
  authorization: "Bearer top-secret-token",
  cookie: "session=secret-cookie",
  apiKey: "sk-secret",
});

export type SecretScanCategory =
  | "snapshots"
  | "graph"
  | "manifest"
  | "generated-source"
  | "build-image"
  | "plan"
  | "pulumi-reports"
  | "cloud-evidence"
  | "browser";

export interface SecretScanMatch {
  readonly source: string;
  readonly secretName: keyof typeof SYNTHETIC_SECRETS;
  readonly line: number;
  readonly column: number;
}

export interface SecretScanReport {
  readonly filesScanned: number;
  readonly bytesScanned: number;
  readonly categories: Readonly<Record<SecretScanCategory, number>>;
  readonly matches: readonly SecretScanMatch[];
  readonly image: { readonly reference?: string; readonly scanned: boolean };
}

export function scanText(source: string, text: string): SecretScanMatch[] {
  const matches: SecretScanMatch[] = [];
  for (const [secretName, secret] of Object.entries(SYNTHETIC_SECRETS) as [
    keyof typeof SYNTHETIC_SECRETS,
    string,
  ][]) {
    let offset = text.indexOf(secret);
    while (offset >= 0) {
      const before = text.slice(0, offset);
      const line = before.split("\n").length;
      matches.push({
        source,
        secretName,
        line,
        column: offset - before.lastIndexOf("\n"),
      });
      offset = text.indexOf(secret, offset + secret.length);
    }
  }
  return matches.sort((left, right) =>
    `${left.source}:${left.line}:${left.column}:${left.secretName}`.localeCompare(
      `${right.source}:${right.line}:${right.column}:${right.secretName}`,
    ),
  );
}

export function scanValue(source: string, value: unknown): SecretScanMatch[] {
  const matches: SecretScanMatch[] = [];
  const seen = new WeakSet<object>();
  const visit = (current: unknown, path: string): void => {
    if (typeof current === "string") {
      matches.push(...scanText(path, current));
      return;
    }
    if (current instanceof Uint8Array) {
      matches.push(...scanText(path, new TextDecoder().decode(current)));
      return;
    }
    if (current === null || typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current))
      current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else Object.entries(current).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(value, source);
  return matches;
}

export function assertNoRawSyntheticSecrets(source: string, value: unknown): void {
  const matches = scanValue(source, value);
  if (matches.length > 0)
    throw new Error(
      `${source} contains raw synthetic secrets: ${matches
        .map(({ secretName, source: path }) => `${secretName}@${path}`)
        .join(", ")}`,
    );
}

export async function scanReleaseArtifacts(
  root: string,
  options: { readonly imageReference?: string } = {},
): Promise<SecretScanReport> {
  const artifacts = await artifactFiles(resolve(root));
  const matches: SecretScanMatch[] = [];
  let bytesScanned = 0;
  for (const artifact of artifacts) {
    const bytes = await readFile(artifact.path);
    bytesScanned += bytes.byteLength;
    matches.push(...scanText(artifact.source, new TextDecoder().decode(bytes)));
  }
  let imageScanned = false;
  if (options.imageReference !== undefined) {
    const bytes = await saveImage(options.imageReference);
    bytesScanned += bytes.byteLength;
    imageScanned = true;
    matches.push(
      ...scanText(`docker image ${options.imageReference}`, new TextDecoder().decode(bytes)),
    );
  }
  const categories = Object.fromEntries(
    (
      [
        "snapshots",
        "graph",
        "manifest",
        "generated-source",
        "build-image",
        "plan",
        "pulumi-reports",
        "cloud-evidence",
        "browser",
      ] as const
    ).map((category) => [
      category,
      artifacts.filter((artifact) => artifact.category === category).length +
        (category === "build-image" && imageScanned ? 1 : 0),
    ]),
  ) as Readonly<Record<SecretScanCategory, number>>;
  return {
    filesScanned: artifacts.length,
    bytesScanned,
    categories,
    matches,
    image: {
      ...(options.imageReference === undefined ? {} : { reference: options.imageReference }),
      scanned: imageScanned,
    },
  };
}

async function saveImage(reference: string): Promise<Uint8Array> {
  const child = Bun.spawn(["docker", "save", reference], { stdout: "pipe", stderr: "pipe" });
  const [bytes, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`docker save ${reference} failed: ${stderr.trim()}`);
  return new Uint8Array(bytes);
}

async function main(): Promise<void> {
  const root = resolve(process.argv[2] ?? join(import.meta.dir, ".."));
  const report = await scanReleaseArtifacts(root, {
    imageReference: process.env.RELKIT_SECURITY_IMAGE,
  });
  if (report.matches.length > 0) {
    for (const match of report.matches)
      console.error(`${match.source}:${match.line}:${match.column} raw ${match.secretName}`);
    throw new Error(`Synthetic-secret scan failed with ${report.matches.length} raw match(es).`);
  }
  console.log(JSON.stringify({ protocol: "relkit.synthetic-secret-scan", ...report }, null, 2));
}

if (import.meta.main) await main();
