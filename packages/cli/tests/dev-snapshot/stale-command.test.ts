import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "@relkit/contracts";
import manifest from "../../package.json" with { type: "json" };
import effectManifest from "effect/package.json" with { type: "json" };
import typescriptManifest from "typescript/package.json" with { type: "json" };
import { SnapshotTools } from "../../src/dev-snapshot/snapshot.schemas.js";
import {
  snapshotDigest,
  snapshotFingerprint,
} from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { validationFixture } from "./validation-fixture.js";

it.live("rejects a stale source before creating any prepared session directory", () =>
  Effect.promise(async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-stale-command-"));
    try {
      const fixture = validationFixture(root);
      const tools = Schema.decodeUnknownSync(SnapshotTools)({
        bun: execFileSync("bun", ["--version"], { encoding: "utf8" }).trim(),
        effect: effectManifest.version,
        typescript: typescriptManifest.version,
        relkit: manifest.version,
        platform: `${process.platform}-${process.arch}`,
      });
      const receipt = {
        ...fixture.receipt,
        tools,
        ports: { backend: 3000, inspector: 3210 },
        fingerprint: snapshotFingerprint({ ...fixture.receipt, tools }),
      };
      const encoded = canonicalJson(receipt);
      const generation = snapshotDigest(encoded);
      const capsule = join(root, ".relkit/dev/generations", generation.slice(7));
      for (const [path, text] of fixture.bytes) {
        if (!path.startsWith(fixture.capsuleRoot + "/") || path.endsWith("/receipt.json")) continue;
        const destination = join(capsule, path.slice(fixture.capsuleRoot.length + 1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, text);
      }
      await writeFile(join(capsule, "receipt.json"), encoded);
      await writeFile(
        join(root, ".relkit/dev/current.json"),
        canonicalJson({ version: 1, generation }),
      );
      await mkdir(join(root, "src"));
      await writeFile(join(root, "src/app.ts"), "changed source");
      const command = fileURLToPath(
        new URL("../../src/dev-snapshot/snapshot-command.ts", import.meta.url),
      );
      const output = execFileSync(
        "bun",
        [
          "-e",
          `
        const { runPreparedDev } = await import(${JSON.stringify(command)});
        console.log(await runPreparedDev(["--project-root", ${JSON.stringify(root)}], new AbortController().signal));
      `,
        ],
        { encoding: "utf8", timeout: 15_000 },
      );
      expect(output.trim()).toBe("false");
      expect(existsSync(join(root, ".relkit/dev/sessions"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }),
);
