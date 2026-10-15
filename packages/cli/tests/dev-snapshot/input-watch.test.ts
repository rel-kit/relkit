/** Exercises real installed-input watches, bounded native registration and complete acquisition rollback. */
import { expect, test } from "bun:test";
import { watch } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { watchSnapshotInputs } from "../../src/dev-snapshot/snapshot-input-watch.js";
import { startSnapshotCommandPreflight } from "../../src/dev-snapshot/snapshot-command-preflight.js";

const members = [{ path: "node_modules/library/types/index.d.ts", bytes: 1, hash: "unused" }];
const observations = [
  { path: "node_modules/library/absent/nested.d.ts", kind: "fileExists", exists: false },
];

async function fixture(use: (root: string, outside: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "relkit-input-watch-"));
  const root = join(parent, "app"),
    outside = join(parent, "outside");
  try {
    for (const path of [
      "src/deep/helper.ts",
      members[0]!.path,
      "node_modules/unrelated/deep/nested/index.js",
      ".relkit/ignored/index.js",
    ])
      await put(root, path);
    await mkdir(outside);
    await use(root, outside);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function put(root: string, path: string, content = "x"): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

test("installed-input registration never recursively walks unrelated dependencies or runtime state", () =>
  fixture(async (root) => {
    const registrations: { path: string; recursive: boolean }[] = [];
    const open: NonNullable<Parameters<typeof watchSnapshotInputs>[5]> = (
      path,
      options,
      listener,
    ) => {
      registrations.push({ path: relative(root, path), recursive: options.recursive });
      return watch(path, options, listener);
    };
    const close = watchSnapshotInputs(
      root,
      members,
      observations,
      () => {},
      () => {},
      open,
    );
    try {
      expect(registrations.filter((entry) => entry.recursive)).toEqual([
        { path: "src", recursive: true },
      ]);
      expect(registrations.map((entry) => entry.path).sort()).toEqual([
        "",
        "node_modules",
        "node_modules/library",
        "node_modules/library/types",
        "src",
      ]);
    } finally {
      close();
      close();
    }
  }));

// Linux uses this bounded plan; macOS keeps its existing recursive FSEvents watch.
for (const path of [
  "src/deep/helper.ts",
  "src/new/deeper/helper.ts",
  "new-source/helper.ts",
  members[0]!.path,
  "node_modules/library/absent/nested.d.ts",
])
  test.skipIf(process.platform !== "linux")(
    `native input observation invalidates after changing ${path}`,
    () =>
      fixture(async (root) => {
        let changed!: () => void;
        let failed!: (cause: unknown) => void;
        const observed = new Promise<void>((resolve, reject) => {
          changed = resolve;
          failed = reject;
        });
        const close = watchSnapshotInputs(root, members, observations, changed, failed);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await put(root, path, "changed");
          await Promise.race([
            observed,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Native input event was not observed")),
                5_000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
          close();
        }
      }),
    10_000,
  );

test("partial registration failures close every previously acquired native watcher", () =>
  fixture(async (root) => {
    let acquired = 0,
      released = 0;
    const open: NonNullable<Parameters<typeof watchSnapshotInputs>[5]> = (
      path,
      options,
      listener,
    ) => {
      if (++acquired === 3) throw new Error("Injected registration failure");
      const watcher = watch(path, options, listener);
      const close = watcher.close.bind(watcher);
      watcher.close = () => {
        released++;
        close();
      };
      return watcher;
    };
    expect(() =>
      watchSnapshotInputs(
        root,
        members,
        observations,
        () => {},
        () => {},
        open,
      ),
    ).toThrow("Injected registration failure");
    expect(released).toBe(2);
  }));

test("escaped member/query paths and external installed links reject registration", () =>
  fixture(async (root, outside) => {
    for (const path of [
      "../outside/file.ts",
      "/outside/file.ts",
      "node_modules/../../outside/file.ts",
    ])
      expect(() =>
        watchSnapshotInputs(
          root,
          members,
          [{ path }],
          () => {},
          () => {},
        ),
      ).toThrow("Invalid snapshot input watch path");
    await symlink(outside, join(root, "node_modules/escaped"));
    expect(() =>
      watchSnapshotInputs(
        root,
        members,
        [{ path: "node_modules/escaped/missing.ts" }],
        () => {},
        () => {},
      ),
    ).toThrow("escaped its project");
  }));

test("preflight refuses unauthenticated receipt bytes before trusting their watch inventory", () =>
  fixture(async (root) => {
    const generation = "sha256:" + "0".repeat(64);
    await put(root, `.relkit/dev/generations/${generation.slice(7)}/receipt.json`);
    await writeFile(
      join(root, `.relkit/dev/generations/${generation.slice(7)}/receipt.json`),
      JSON.stringify({
        inputs: [],
        dependencies: [],
        typecheckInputs: { files: [], observations: [] },
      }),
    );
    await writeFile(join(root, ".relkit/dev/current.json"), JSON.stringify({ generation }));
    const proof = startSnapshotCommandPreflight(
      ["--project-root", root],
      new AbortController().signal,
    );
    try {
      expect(proof).toBeUndefined();
    } finally {
      proof?.epoch.close();
      await proof?.mismatch.catch(() => undefined);
    }
  }));
