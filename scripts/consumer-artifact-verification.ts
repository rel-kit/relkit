/** Rejects changed retained packs before a benchmark can serve or install them. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";

const Record = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  sha256: Schema.String,
  sha512: Schema.String,
  integrity: Schema.String,
});
const Manifest = Schema.Struct({ packages: Schema.Array(Record) });

/** Compares both saved digests and registry integrity against the exact bytes. */
export function verifyConsumerArchive(bytes: Uint8Array, record: typeof Record.Type): void {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const digest512 = createHash("sha512").update(bytes).digest();
  if (
    sha256 !== record.sha256 ||
    digest512.toString("hex") !== record.sha512 ||
    `sha512-${digest512.toString("base64")}` !== record.integrity
  )
    throw new Error(`Retained consumer artifact digest mismatch: ${record.name}`);
}

/** Verifies only files contained in the supplied immutable artifact directory. */
export const verifyConsumerArchives = Effect.fn("ConsumerArtifacts.verify")(function* (
  directory: string,
) {
  const text = yield* inspectionNative("artifacts.readManifest", () =>
    readFile(join(directory, "manifest.json"), "utf8"),
  );
  const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))(text);
  for (const record of manifest.packages) {
    const path = resolve(directory, record.file);
    const child = relative(resolve(directory), path);
    if (child === ".." || child.startsWith("../") || isAbsolute(child))
      return yield* consumerInputFailure(
        "artifacts.containment",
        `Retained artifact escapes its directory: ${record.name}`,
      );
    yield* inspectionNative("artifacts.digest", async () =>
      verifyConsumerArchive(await readFile(path), record),
    );
  }
});
