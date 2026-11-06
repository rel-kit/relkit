/** Prepares the launcher smoke fixture: owned folders, already installed Bun/Node/npm tools and the candidate registry environment. */
import { strict as assert } from "node:assert";
import { access, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Schema } from "effect";
import type { PackedWrapperContext, PackedWrapperRunner } from "./packed-wrapper.types.js";

/** Prepares only owned empty projects, executable links and separate package-manager caches. */
export async function wrapperContext(
  temporary: string,
  registry: string,
  versions: {
    readonly wrapperVersion: string;
    readonly wrapperDependencies: Readonly<Record<string, string>>;
    readonly creatorVersion: string;
    readonly cliVersion: string;
  },
): Promise<PackedWrapperContext> {
  const tools = join(temporary, "tools"),
    consumer = join(temporary, "consumer");
  const node = Bun.which("node"),
    npm = Bun.which("npm");
  assert.ok(node, "Installed Node is required for npm runner coverage");
  assert.ok(npm, "Installed npm is required for npm runner coverage");
  const npmScript = await realpath(npm);
  const npxScript = join(dirname(npmScript), "npx-cli.js");
  await access(npxScript);
  const npmMetadata = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
  )(await readFile(join(dirname(npmScript), "../package.json"), "utf8"));
  await mkdir(tools);
  await mkdir(consumer);
  await mkdir(join(temporary, "bun-tmp"));
  await symlink(process.execPath, join(tools, "bun"));
  await symlink(await realpath(node), join(tools, "node"));
  // `relkit create` under npm runs the creator through `npx`, so the runner needs it on PATH.
  await symlink(npmScript, join(tools, "npm"));
  await symlink(npxScript, join(tools, "npx"));
  await writeFile(
    join(consumer, "package.json"),
    '{"name":"empty-wrapper-project","private":true}\n',
  );
  const env = {
    PATH: `${tools}:/usr/bin:/bin`,
    BUN_TMPDIR: join(temporary, "bun-tmp"),
    TMPDIR: join(temporary, "bun-tmp"),
    TEMP: join(temporary, "bun-tmp"),
    BUN_INSTALL_CACHE_DIR: join(temporary, "bun-cache"),
    npm_config_cache: join(temporary, "npm-cache"),
    BUN_CONFIG_REGISTRY: registry,
    npm_config_registry: registry,
    npm_config_maxsockets: "1",
    npm_config_audit: "false",
    npm_config_fund: "false",
    NODE_OPTIONS: "--max-old-space-size=768",
  };
  return {
    temporary,
    consumer,
    registry,
    env,
    wrapperVersion: versions.wrapperVersion,
    wrapperDependencies: versions.wrapperDependencies,
    creatorVersion: versions.creatorVersion,
    cliVersion: versions.cliVersion,
    npmScript,
    npxScript,
    npmVersion: npmMetadata.version,
  };
}

/** Uses an exact candidate package version with the installed native runner, without downloading a different runner. */
export function wrapperRunners(context: PackedWrapperContext): readonly PackedWrapperRunner[] {
  return [
    {
      name: "bun",
      executable: "bun",
      prefix: ["x", `relkit@${context.wrapperVersion}`],
      cache: join(context.temporary, "bun-tmp"),
    },
    {
      name: "npm",
      executable: "node",
      prefix: [
        context.npmScript,
        "exec",
        "--yes",
        `--package=relkit@${context.wrapperVersion}`,
        "--",
        "relkit",
      ],
      cache: join(context.temporary, "npm-cache/_npx"),
    },
  ];
}

/** Uses the actual Bun runner or installed npx module for the independent creator path. */
export function wrapperCreatorPrefix(
  context: PackedWrapperContext,
  runner: PackedWrapperRunner,
): readonly string[] {
  return runner.name === "bun"
    ? ["x", `create-relkit@${context.creatorVersion}`]
    : [
        context.npxScript,
        "--yes",
        `--package=create-relkit@${context.creatorVersion}`,
        "create-relkit",
      ];
}
