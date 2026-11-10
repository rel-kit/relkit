import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readManifest, type Manifest } from "../../scripts/release-manifest.ts";

test("publisher resumes exact archives, skips completed packages, and protects latest", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "relkit-publish-recovery-"));
  try {
    const artifacts = [];
    for (const [name, version] of [
      ["@relkit/contracts", "0.7.9"],
      ["@relkit/schema", "0.8.1"],
    ]) {
      const bytes = Buffer.from(`original bytes for ${name}`);
      const sha512 = createHash("sha512").update(bytes).digest("hex");
      const file = `${name!.slice("@relkit/".length)}.tgz`;
      await writeFile(join(temporary, file), bytes);
      artifacts.push({
        name: name!,
        version: version!,
        file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sha512,
        integrity: `sha512-${Buffer.from(sha512, "hex").toString("base64")}`,
        dependencies: name === "@relkit/schema" ? { "@relkit/contracts": "0.7.9" } : {},
      });
    }
    const manifest: Manifest = {
      protocol: "relkit.release-manifest.v2",
      version: "0.7.10",
      commit: "a".repeat(40),
      packageOrder: artifacts.map((item) => item.name),
      packages: artifacts,
    };
    await writeFile(join(temporary, "manifest.json"), JSON.stringify(manifest));
    expect(readManifest(temporary).packages.map((item) => item.version)).toEqual([
      "0.7.9",
      "0.8.1",
    ]);
    const statePath = join(temporary, "state.json");
    await writeFile(
      statePath,
      JSON.stringify({
        published: { "@relkit/contracts@0.7.9": artifacts[0]!.integrity },
        calls: [],
      }),
    );
    const bin = join(temporary, "bin");
    await mkdir(bin);
    const npm = join(bin, "npm");
    await writeFile(
      npm,
      `#!${process.execPath}\n` +
        String.raw`
      import { readFileSync, writeFileSync } from "node:fs";
      import { basename } from "node:path";
      const args = process.argv.slice(2);
      const state = JSON.parse(readFileSync(process.env.STATE, "utf8"));
      const manifest = JSON.parse(readFileSync(process.env.MANIFEST, "utf8"));
      if (args[0] === "--version") console.log("11.19.0");
      else if (args[0] === "view" && args[1].includes("@>")) { if (state.newer !== false) console.log(JSON.stringify("9.0.0")); }
      else if (args[0] === "view" && args[1].endsWith("@*")) {
        const name = args[1].slice(0, -2);
        if ((state.unregistered ?? []).includes(name)) { console.error("npm error E404 Not Found"); process.exit(1); }
        console.log(JSON.stringify(name));
      }
      else if (args[0] === "view") {
        const integrity = state.published[args[1]];
        if (state.stale === args[1]) {
          delete state.stale;
          writeFileSync(process.env.STATE, JSON.stringify(state));
          console.error("npm error E404 Not Found"); process.exit(1);
        }
        if (state.defer && integrity && Object.keys(state.published).length < manifest.packages.length) {
          console.error("visibility checks blocked the next submission"); process.exit(2);
        }
        if (integrity) console.log(JSON.stringify(integrity));
        else { console.error("npm error E404 Not Found"); process.exit(1); }
      } else if (args[0] === "publish") {
        const artifact = manifest.packages.find((item) => item.file === basename(args[1]));
        state.calls.push(args);
        if (state.duplicate && state.published[artifact.name + "@" + artifact.version]) {
          writeFileSync(process.env.STATE, JSON.stringify(state));
          console.error("npm error E403 You cannot publish over the previously published versions: " + artifact.version);
          process.exit(1);
        }
        if (state.denied) { console.error("npm error E403 permission denied"); process.exit(1); }
        state.published[artifact.name + "@" + artifact.version] = artifact.integrity;
        writeFileSync(process.env.STATE, JSON.stringify(state));
        console.log("accepted original archive");
      } else process.exit(2);
    `,
    );
    await chmod(npm, 0o755);
    const clock = join(temporary, "clock.mjs");
    await writeFile(clock, "let time = 0; Date.now = () => time += 300000;\n");
    const execute = async (advanceClock = false) => {
      const child = Bun.spawn(
        [
          "node",
          "--experimental-strip-types",
          ...(advanceClock ? ["--import", clock] : []),
          resolve(import.meta.dir, "../../scripts/publish-release.ts"),
          "--directory",
          temporary,
          "--publish",
        ],
        {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            STATE: statePath,
            MANIFEST: join(temporary, "manifest.json"),
            NPM_RELEASES_ENABLED: "true",
            GITHUB_REPOSITORY_VISIBILITY: "public",
            GITHUB_REF_NAME: "main",
            GITHUB_SHA: "b".repeat(40),
            RELEASE_SHA: manifest.commit,
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
      return { code, output: stdout + stderr };
    };
    expect((await execute()).code).toBe(0);
    let state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0][1]).toBe(join(temporary, artifacts[1]!.file));
    expect(state.calls[0]).toContain("release-0.7.10");
    expect(await readFile(join(temporary, "publish.log"), "utf8")).toContain(
      "accepted original archive",
    );
    expect((await execute()).code).toBe(0);
    state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.calls).toHaveLength(1);
    delete state.published["@relkit/schema@0.8.1"];
    state.newer = false;
    state.calls = [];
    await writeFile(statePath, JSON.stringify(state));
    expect((await execute()).code).toBe(0);
    state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.calls[0]).toContain("latest");
    state.published["@relkit/schema@0.8.1"] = "sha512-wrong";
    await writeFile(statePath, JSON.stringify(state));
    const conflict = await execute();
    expect(conflict.code).not.toBe(0);
    expect(conflict.output).toContain("Registry integrity mismatch");
    state = { published: {}, calls: [], defer: true, newer: false };
    await writeFile(statePath, JSON.stringify(state));
    const delayed = await execute();
    expect(delayed.output).not.toContain("visibility checks blocked");
    expect(delayed.code).toBe(0);
    state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.calls.map((args: string[]) => args[1])).toEqual([
      join(temporary, artifacts[0]!.file),
      join(temporary, artifacts[1]!.file),
    ]);
    state.stale = "@relkit/schema@0.8.1";
    state.duplicate = true;
    await writeFile(statePath, JSON.stringify(state));
    expect((await execute()).code).toBe(0);
    state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.calls).toHaveLength(3);
    state.published["@relkit/schema@0.8.1"] = "sha512-conflict";
    state.stale = "@relkit/schema@0.8.1";
    await writeFile(statePath, JSON.stringify(state));
    expect((await execute()).output).toContain("integrity mismatch");
    state = {
      published: { "@relkit/contracts@0.7.9": "sha512-conflict" },
      calls: [],
      stale: "@relkit/contracts@0.7.9",
      duplicate: true,
    };
    await writeFile(statePath, JSON.stringify(state));
    const dependencyConflict = await execute();
    expect(dependencyConflict.code).not.toBe(0);
    expect(dependencyConflict.output).toContain("integrity mismatch");
    state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.calls).toHaveLength(1);
    state = { published: {}, calls: [], denied: true };
    await writeFile(statePath, JSON.stringify(state));
    const denied = await execute();
    expect(denied.code).not.toBe(0);
    expect(denied.output).toContain("permission denied");
    // A package npm has never seen cannot use trusted publishing; nothing may publish.
    state = { published: {}, calls: [], unregistered: ["@relkit/schema"] };
    await writeFile(statePath, JSON.stringify(state));
    const unregistered = await execute();
    expect(unregistered.code).not.toBe(0);
    expect(unregistered.output).toContain("Not registered on npm: @relkit/schema");
    state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.calls).toHaveLength(0);
    state = { published: {}, calls: [] };
    await writeFile(statePath, JSON.stringify(state));
    const expired = await execute(true);
    expect(expired.code).not.toBe(0);
    expect(expired.output).toContain("publication deadline");
    await writeFile(join(temporary, artifacts[1]!.file), "different rebuild bytes");
    expect(() => readManifest(temporary)).toThrow("checksum mismatch");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);

test("a deprecation CI cannot apply warns instead of withholding the release", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "relkit-publish-deprecation-"));
  try {
    const bytes = Buffer.from("original bytes for @relkit/app");
    const sha512 = createHash("sha512").update(bytes).digest("hex");
    await writeFile(join(temporary, "app.tgz"), bytes);
    const artifact = {
      name: "@relkit/app",
      version: "0.9.0",
      file: "app.tgz",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sha512,
      integrity: `sha512-${Buffer.from(sha512, "hex").toString("base64")}`,
      dependencies: {},
    };
    const manifest: Manifest = {
      protocol: "relkit.release-manifest.v2",
      version: "0.9.0",
      commit: "a".repeat(40),
      packageOrder: [artifact.name],
      packages: [artifact],
    };
    await writeFile(join(temporary, "manifest.json"), JSON.stringify(manifest));
    const statePath = join(temporary, "state.json");
    const bin = join(temporary, "bin");
    await mkdir(bin);
    // The package is published; `npm deprecate` is refused like an OIDC-only CI token.
    await writeFile(
      join(bin, "npm"),
      `#!${process.execPath}\n` +
        String.raw`
      import { readFileSync, writeFileSync } from "node:fs";
      const args = process.argv.slice(2);
      const state = JSON.parse(readFileSync(process.env.STATE, "utf8"));
      if (args[0] === "--version") console.log("11.19.0");
      else if (args[0] === "view" && args[2] === "deprecated") { if (state.deprecated) console.log(state.deprecated); }
      else if (args[0] === "view" && args[1].endsWith("@*")) console.log(JSON.stringify("@relkit/app"));
      else if (args[0] === "view") console.log(JSON.stringify(process.env.INTEGRITY));
      else if (args[0] === "deprecate") {
        state.deprecations += 1;
        writeFileSync(process.env.STATE, JSON.stringify(state));
        console.error("npm error code E404"); process.exit(1);
      } else process.exit(2);
    `,
    );
    await chmod(join(bin, "npm"), 0o755);
    const execute = async () => {
      const child = Bun.spawn(
        [
          "node",
          "--experimental-strip-types",
          resolve(import.meta.dir, "../../scripts/publish-release.ts"),
          "--directory",
          temporary,
          "--publish",
        ],
        {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            STATE: statePath,
            INTEGRITY: artifact.integrity,
            NPM_RELEASES_ENABLED: "true",
            GITHUB_REPOSITORY_VISIBILITY: "public",
            GITHUB_REF_NAME: "main",
            RELEASE_SHA: manifest.commit,
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
      return { code, output: stdout + stderr };
    };
    await writeFile(statePath, JSON.stringify({ deprecations: 0 }));
    const refused = await execute();
    expect(refused.code).toBe(0);
    expect(refused.output).toContain("::warning::Could not deprecate @relkit/app@0.9.0");
    expect(JSON.parse(await readFile(statePath, "utf8")).deprecations).toBe(1);
    const { releaseDeprecations } = await import("../../scripts/release-deprecations.ts");
    await writeFile(
      statePath,
      JSON.stringify({ deprecations: 0, deprecated: releaseDeprecations["@relkit/app"] }),
    );
    const applied = await execute();
    expect(applied.code).toBe(0);
    expect(applied.output).not.toContain("::warning::");
    expect(JSON.parse(await readFile(statePath, "utf8")).deprecations).toBe(0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);
