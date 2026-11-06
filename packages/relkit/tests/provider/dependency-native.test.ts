/** Verifies real physical resolution, version boundaries and unchanged inputs. */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkNative, nativeFixture, nativePackage } from "./dependency-native.fixture.js";

const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("native selected dependency resolution", () => {
  it("reads hidden metadata through isolated adapter paths without evaluation or mutation", () => {
    const fixture = nativeFixture();
    const manifest = join(fixture.root, "package.json");
    const lock = join(fixture.root, "bun.lock");
    writeFileSync(manifest, '{"name":"consumer","packageManager":"npm@11.7.0"}');
    writeFileSync(lock, "original lock bytes");
    const before = [hash(manifest), hash(lock)];
    try {
      expect(checkNative(fixture.selection)).toEqual([
        { name: "fixture-sdk", version: "1.0.0-beta.2", root: realpathSync(fixture.sdk) },
      ]);
      expect([hash(manifest), hash(lock)]).toEqual(before);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("revalidates removal and incompatible version without a changed lockfile", () => {
    const fixture = nativeFixture();
    try {
      expect(Array.isArray(checkNative(fixture.selection))).toBe(true);
      rmSync(fixture.sdk, { recursive: true });
      expect(checkNative(fixture.selection)).toMatchObject({
        _tag: "SelectedDependencyFailure",
        diagnostics: [{ code: "RELKIT_DEPENDENCY_MISSING", package: "fixture-sdk" }],
      });
      nativePackage(fixture.adapter, "fixture-sdk", "2.0.0");
      expect(checkNative(fixture.selection)).toMatchObject({
        diagnostics: [{ code: "RELKIT_DEPENDENCY_VERSION_UNSUPPORTED", installedVersion: "2.0.0" }],
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("native selected capability and adapter roots", () => {
  it("honors prerelease boundaries and ignores unselected missing capabilities", () => {
    const fixture = nativeFixture();
    try {
      const requirement = fixture.selection.requirements[0]!;
      expect(
        checkNative({
          ...fixture.selection,
          requirements: [{ ...requirement, supportedRange: "^1.0.0" }],
        }),
      ).toMatchObject({ diagnostics: [{ code: "RELKIT_DEPENDENCY_VERSION_UNSUPPORTED" }] });
      expect(checkNative({ ...fixture.selection, capabilities: ["agent-state"] })).toEqual([]);
      expect(checkNative({ ...fixture.selection, phase: "deploy" })).toEqual([]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("accepts the loaded adapter's own root without using runner cache roots", () => {
    const fixture = nativeFixture();
    try {
      expect(
        checkNative({
          ...fixture.selection,
          projectRoot: join(fixture.root, "unrelated"),
          adapterRoot: fixture.adapter,
        }),
      ).toHaveLength(1);
      expect(
        checkNative({ ...fixture.selection, projectRoot: join(fixture.root, "foreign/project") }),
      ).toHaveLength(1);
      // A sibling unrelated application cannot discover the adapter's nested SDK.
      expect(
        checkNative({ ...fixture.selection, adapter: "@fixture/not-installed" }),
      ).toMatchObject({ _tag: "SelectedDependencyFailure" });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("native selected manifest metadata", () => {
  it("keeps malformed installed metadata distinct from a missing SDK", () => {
    const fixture = nativeFixture();
    try {
      writeFileSync(join(fixture.sdk, "package.json"), "invalid JSON");
      expect(checkNative(fixture.selection)).toMatchObject({
        _tag: "DependencyResolutionFailure",
        package: "fixture-sdk",
        cause: expect.any(Error),
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("derives selected requirements from the owning adapter manifest", () => {
    const fixture = nativeFixture();
    try {
      writeFileSync(
        join(fixture.adapter, "package.json"),
        JSON.stringify({
          name: fixture.selection.adapter,
          version: "1.0.0",
          relkit: { integration: { id: "fixture", dependencies: fixture.selection.requirements } },
        }),
      );
      const { requirements, ...selection } = fixture.selection;
      expect(checkNative({ ...selection, adapterRoot: fixture.adapter })).toHaveLength(1);
      rmSync(fixture.sdk, { recursive: true });
      expect(checkNative({ ...selection, adapterRoot: fixture.adapter })).toMatchObject({
        diagnostics: [{ code: "RELKIT_DEPENDENCY_MISSING", package: "fixture-sdk" }],
      });
      expect(checkNative({ ...selection, capabilities: ["unused"] })).toEqual([]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("native selected dependency installer guidance", () => {
  it.each(["bun@1.3.10", "npm@11.19.0", "pnpm@11.9.0"])(
    "uses project installer %s for correction commands",
    (packageManager) => {
      const fixture = nativeFixture();
      try {
        writeFileSync(
          join(fixture.root, "package.json"),
          JSON.stringify({ name: "consumer", packageManager }),
        );
        rmSync(fixture.sdk, { recursive: true });
        const { manager, ...selection } = fixture.selection;
        const installer = packageManager.split("@")[0];
        expect(checkNative(selection)).toMatchObject({
          diagnostics: [
            {
              install: `${installer} ${installer === "npm" ? "install" : "add"} fixture-sdk@^1.0.0-beta.1`,
            },
          ],
        });
      } finally {
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it("does not infer an installer from npm runner environment", () => {
    const fixture = nativeFixture();
    const previous = process.env.npm_config_user_agent;
    try {
      process.env.npm_config_user_agent = "npm/11.19.0 node/v24";
      rmSync(fixture.sdk, { recursive: true });
      const { manager, ...selection } = fixture.selection;
      expect(checkNative(selection)).toMatchObject({
        diagnostics: [{ install: "bun add fixture-sdk@^1.0.0-beta.1" }],
      });
    } finally {
      if (previous === undefined) delete process.env.npm_config_user_agent;
      else process.env.npm_config_user_agent = previous;
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
