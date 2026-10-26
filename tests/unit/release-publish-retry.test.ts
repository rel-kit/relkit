/** Exercises pre-upload provenance recovery with the real publisher and a local npm boundary. */
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Writes one immutable candidate and its independently computed checksums.
 * @param directory - Test-owned root removed after the native child settles.
 * @returns Original bytes and manifest entry for post-publication assertions.
 */
async function prepareArtifacts(directory: string) {
  const bytes = Buffer.from("original validated archive");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const artifact = {
    name: "@relkit/contracts",
    version: "1.0.0",
    file: "contracts.tgz",
    integrity,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sha512: createHash("sha512").update(bytes).digest("hex"),
    dependencies: {},
  };
  await writeFile(join(directory, artifact.file), bytes);
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({
      protocol: "relkit.release-manifest.v2",
      version: "1.0.0",
      commit: "a".repeat(40),
      packageOrder: [artifact.name],
      packages: [artifact],
    }),
  );
  return { bytes, artifact };
}

/**
 * Supplies a finite local npm executable and accelerates only publisher wait timers.
 * @param directory - Owned root containing artifacts, executable and mutable registry state.
 * @param error - Exact first-attempt diagnostic from the external npm boundary.
 * @returns Completion after the executable and child-only timer adapter are ready.
 */
async function prepareNpmBoundary(directory: string, error: string) {
  await writeFile(
    join(directory, "state.json"),
    JSON.stringify({ calls: [], published: false, error }),
  );
  await writeFile(
    join(directory, "npm"),
    `#!${process.execPath}\n` +
      String.raw`
      import { readFileSync, writeFileSync } from "node:fs";
      const location = new URL("./state.json", import.meta.url);
      const state = JSON.parse(readFileSync(location, "utf8"));
      const artifact = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")).packages[0];
      const args = process.argv.slice(2);
      if (args[0] === "--version") console.log("11.19.0");
      else if (args[0] === "view" && args[1].includes("@>")) process.exit(0);
      else if (args[0] === "view" && state.published) console.log(JSON.stringify(artifact.integrity));
      else if (args[0] === "view") { console.error("npm error E404 Not Found"); process.exit(1); }
      else if (args[0] === "publish") {
        state.calls.push(args);
        state.published = state.calls.length > 1;
        writeFileSync(location, JSON.stringify(state));
        if (!state.published) { console.error(state.error); process.exit(1); }
      } else process.exit(2);
    `,
  );
  await chmod(join(directory, "npm"), 0o755);
  await writeFile(
    join(directory, "clock.mjs"),
    'import { setTimeout as timer } from "node:timers"; globalThis.setTimeout = (callback, delay, ...args) => timer(callback, 0, ...args);\n',
  );
}

for (const failure of [
  { label: "identity lookup", error: "npm error code IDENTITY_TOKEN_READ_ERROR" },
  {
    label: "duplicate transparency entry",
    error:
      "npm error code TLOG_CREATE_ENTRY_ERROR\nnpm error error creating tlog entry - (409) an equivalent entry already exists in the transparency log with UUID example",
  },
])
  test(`publisher retries ${failure.label} with the same original archive`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-publish-provenance-"));
    try {
      const { bytes, artifact } = await prepareArtifacts(directory);
      await prepareNpmBoundary(directory, failure.error);
      const child = Bun.spawn(
        [
          "node",
          "--experimental-strip-types",
          "--import",
          join(directory, "clock.mjs"),
          resolve(import.meta.dir, "../../scripts/publish-release.ts"),
          "--directory",
          directory,
          "--publish",
        ],
        {
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            NPM_RELEASES_ENABLED: "true",
            GITHUB_REPOSITORY_VISIBILITY: "public",
            GITHUB_REF_NAME: "main",
            RELEASE_SHA: "a".repeat(40),
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code, stdout + stderr).toBe(0);
      const state = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
      expect(state.calls).toHaveLength(2);
      expect(state.calls[0]).toEqual(state.calls[1]);
      expect(state.calls[1]).toContain("--provenance");
      expect(await readFile(join(directory, artifact.file))).toEqual(bytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

test("persistent identity failure exhausts three attempts and preserves the error", async () => {
  const { publishWithProvenanceRetry } = await import("../../scripts/release-publish-retry.ts");
  const failure = new Error("npm error code IDENTITY_TOKEN_READ_ERROR\n");
  let calls = 0;
  const delays: number[] = [];
  await expect(
    publishWithProvenanceRetry(
      () => {
        calls++;
        if (calls < 3) throw new Error("npm error code IDENTITY_TOKEN_READ_ERROR\nearlier failure");
        throw failure;
      },
      async (delay) => {
        delays.push(delay);
      },
    ),
  ).rejects.toBe(failure);
  expect(calls).toBe(3);
  expect(delays).toEqual([10_000, 20_000]);
});

for (const message of [
  "npm error code E403",
  "npm error code ENEEDAUTH",
  "Registry integrity mismatch",
  "npm notice filename: IDENTITY_TOKEN_READ_ERROR",
  "npm error code TLOG_CREATE_ENTRY_ERROR\nnpm error error creating tlog entry - (403) forbidden",
])
  test(`publisher does not retry ${message}`, async () => {
    const { publishWithProvenanceRetry } = await import("../../scripts/release-publish-retry.ts");
    const failure = new Error(message);
    let calls = 0;
    await expect(
      publishWithProvenanceRetry(
        () => {
          calls++;
          throw failure;
        },
        async () => {
          throw new Error("Unexpected retry");
        },
      ),
    ).rejects.toBe(failure);
    expect(calls).toBe(1);
  });
