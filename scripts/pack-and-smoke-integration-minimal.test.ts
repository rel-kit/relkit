/** Exercises contained native dependency copies and phase-specific public integration entries. */
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { runCommand } from "./pack-and-smoke-create-relkit-support.js";
import {
  copyExternalDependencies,
  smokeMinimalIntegrationInstalls,
} from "./pack-and-smoke-integration-minimal.ts";

test("copies installed platform optional dependencies for packed exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-packed-optional-"));
  const repositoryRoot = join(root, "repository");
  const fixture = join(root, "fixture");
  const host = join(repositoryRoot, "node_modules", "host");
  const native = join(host, "node_modules", "native-platform");
  try {
    await mkdir(native, { recursive: true });
    await writeFile(
      join(host, "package.json"),
      JSON.stringify({
        name: "host",
        optionalDependencies: { "native-platform": "1", "other-platform": "1" },
      }),
    );
    await writeFile(join(native, "package.json"), JSON.stringify({ name: "native-platform" }));
    await writeFile(join(native, "binding.node"), "native fixture");

    await copyExternalDependencies(fixture, new Set(["host"]), repositoryRoot, []);

    expect(
      await readFile(join(fixture, "node_modules", "native-platform", "binding.node"), "utf8"),
    ).toBe("native fixture");
    await expect(access(join(fixture, "node_modules", "other-platform"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loads peer-free authoring before selecting the real Inngest runtime peer", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-packed-phases-"));
  try {
    const { manifest, archive } = await nativePhaseArchive(root);
    const consumers = join(root, "consumers");
    expect(
      await smokeMinimalIntegrationInstalls(
        consumers,
        import.meta.dirname + "/..",
        [],
        new Set([manifest.name]),
        new Map([[manifest.name, manifest]]),
        new Map([[manifest.name, archive]]),
        (target) => installNativePhase(target, archive, join(root, "cache")),
      ),
    ).toBe(1);
    const fixture = join(consumers, manifest.name);
    expect(await readFile(join(fixture, "phases.txt"), "utf8")).toBe("absent\npresent\n");
    await expect(access(join(fixture, "node_modules"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 180_000);

test("still rejects an unrelated first-party integration in a selected peer closure", async () => {
  const manifests = new Map([
    ["selected", { peerDependencies: { unrelated: "1" } }],
    ["unrelated", {}],
  ]);
  await expect(
    smokeMinimalIntegrationInstalls(
      "/unused",
      "/unused",
      [],
      new Set(manifests.keys()),
      manifests,
      new Map(),
      async () => {
        throw new Error("Unrelated closure must reject before installation");
      },
    ),
  ).rejects.toThrow("selected pulls unrelated integrations: unrelated");
});

/** Packs only the adapter fixture; its runtime imports the real native Inngest package. */
async function nativePhaseArchive(root: string) {
  const source = join(root, "source");
  await mkdir(source);
  const manifest = {
    name: "phase-integration",
    type: "module",
    exports: { ".": "./authoring.js", "./runtime": "./runtime.js" },
    peerDependencies: { inngest: "4.20.0" },
  };
  await writeFile(join(source, "package.json"), JSON.stringify(manifest));
  await writeFile(
    join(source, "authoring.js"),
    `
    import { appendFileSync } from "node:fs";
    let phase = "absent";
    try { import.meta.resolve("inngest"); phase = "present"; } catch {}
    appendFileSync("phases.txt", phase + "\\n");
  `,
  );
  await writeFile(
    join(source, "runtime.js"),
    `
    import { Inngest } from "inngest";
    if (typeof Inngest !== "function") throw new Error("Native Inngest export missing");
    try { import.meta.resolve("deepagents"); throw new Error("Unrelated SDK installed"); }
    catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
  `,
  );
  const archive = join(root, "integration.tgz");
  const pack = Bun.spawn(["tar", "-czf", archive, "-C", root, "source"]);
  expect(await pack.exited).toBe(0);
  return { manifest, archive };
}

/** Delegates native transitive versions and platform packages to the actual isolated installer. */
async function installNativePhase(target: string, archive: string, cache: string) {
  await rm(join(target, "node_modules"), { recursive: true, force: true });
  await writeFile(
    join(target, "package.json"),
    JSON.stringify({
      dependencies: { "phase-integration": `file:${archive}`, inngest: "4.20.0" },
    }),
  );
  await runCommand(
    [
      "install",
      "--linker=isolated",
      "--network-concurrency=1",
      "--concurrent-scripts=1",
      "--ignore-scripts",
    ],
    target,
    undefined,
    cache,
  );
}
