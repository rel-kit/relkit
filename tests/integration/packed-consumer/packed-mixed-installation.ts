/** Reuses exact candidate registry installs and audits the actual contained closure for the two mixed acceptance roots. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { consumerArtifacts } from "../../../scripts/consumer-artifacts.js";
import { consumerInstallCommand } from "../../../scripts/consumer-install-command.js";
import { inspectInstallation } from "../../../scripts/consumer-installation.js";
import { consumerRegistry } from "../../../scripts/consumer-registry.js";
import { exactVersion } from "../../../scripts/catalog-manifest.js";
import { ScaffoldProcess } from "../../../scripts/scaffold-process.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

/** Installs real selected deployment peers from their exact packed owner declarations. */
export const installPackedDeployment = Effect.fn("PackedMixed.installDeployment")(function* (
  repository: string,
  artifacts: string,
  root: string,
) {
  const candidate = yield* consumerArtifacts(repository, root, artifacts);
  const { dependencies, devDependencies } = deploymentManifest(candidate);
  yield* scaffoldNative("packed.deploy.manifest", () =>
    writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "packed-deployment-offline",
        private: true,
        type: "module",
        dependencies,
        devDependencies,
      }),
    ),
  );
  const registry = yield* consumerRegistry(root, candidate.tarballs, candidate.manifests);
  const command = yield* consumerInstallCommand(
    "bun-isolated",
    {
      name: "packed-deployment-offline",
      dependencies,
      devDependencies,
      production: false,
    },
    root,
    registry.url,
    join(root, "cache"),
  );
  const runner = yield* ScaffoldProcess;
  const output = yield* runner.run({ ...command, args: [...command.args, "--ignore-scripts"] });
  yield* scaffoldNative("packed.deploy.installLog", () =>
    writeFile(join(root, "install.log"), output),
  );
  return candidate;
});

/** Derives all versions from verified packed owners rather than adding fixture-specific pins. */
function deploymentManifest(candidate: Effect.Success<ReturnType<typeof consumerArtifacts>>) {
  const dependencies = Object.fromEntries(
    ["aws", "pulumi", "deploy", "deploy-pulumi", "compiler"].map((name) => {
      const identity = `@relkit/${name}`;
      assert.ok(candidate.tarballs.has(identity), `Missing candidate ${identity}`);
      const version = candidate.manifests.get(identity)?.manifest.version;
      assert.ok(version);
      return [identity, version];
    }),
  );
  const devDependencies = Object.fromEntries(
    ["aws", "pulumi"].map((name) => {
      const identity = `@pulumi/${name}`;
      const version = candidate.manifests.get(`@relkit/${name}`)?.manifest.peerDependencies?.[
        identity
      ];
      assert.ok(
        version && exactVersion(version),
        `Selected peer must have an exact candidate declaration: ${identity}`,
      );
      return [identity, version];
    }),
  );
  return { dependencies, devDependencies };
}

/** Retains complete closure evidence before asserting required edges, candidate provenance and unrelated SDK absence. */
export const auditPackedMixedClosure = Effect.fn("PackedMixed.auditClosure")(function* (
  root: string,
  candidate: Effect.Success<ReturnType<typeof consumerArtifacts>>,
  deployment: boolean,
) {
  const installation = yield* inspectInstallation(root, { development: true });
  yield* scaffoldNative("packed.mixed.closure", () =>
    writeFile(join(root, "installation.json"), JSON.stringify(installation, null, 2)),
  );
  assert.deepEqual(installation.missing, []);
  for (const instance of installation.instances) {
    if (instance.name.startsWith("@relkit/")) {
      assert.ok(
        candidate.tarballs.has(instance.name),
        `Unpacked first-party owner ${instance.name}`,
      );
      assert.equal(instance.version, candidate.manifests.get(instance.name)?.manifest.version);
    }
    assert.ok(
      !/^(?:@langchain\/|langchain$|langsmith$|deepagents$|@relkit\/(?:langchain|cli|otlp)$|@duckdb\/|next$|react(?:-dom)?$|@tanstack\/|@orpc\/tanstack-query$|better-auth$|drizzle-orm$|drizzle-kit$|pg$|postgres$|mysql2$|better-sqlite3$|sqlite3$|@libsql\/client$|ioredis$|inngest$|effect-mq$|@trigger\.dev\/sdk$|@sentry\/|@modelcontextprotocol\/|@ag-ui\/|@scalar\/)/.test(
        instance.name,
      ),
      `Unrelated SDK installed: ${instance.name}`,
    );
    if (/^@opentelemetry\/(?:sdk|exporter)/.test(instance.name)) {
      const paths = installation.paths.filter((path) => path.packages.at(-1) === instance.name);
      assert.ok(
        deployment &&
          paths.length > 0 &&
          paths.every((path) => path.packages.includes("@pulumi/pulumi")),
        `Telemetry must belong to the selected native Pulumi SDK: ${instance.name}`,
      );
    }
    if (!deployment) assert.ok(!/^@(?:pulumi|aws-sdk|smithy)\//.test(instance.name));
  }
  const selected = deployment ? ["@pulumi/aws", "@pulumi/pulumi"] : ["@relkit/redis"];
  for (const name of selected) {
    const expected = deployment
      ? candidate.manifests.get(`@relkit/${name.slice("@pulumi/".length)}`)?.manifest
          .peerDependencies?.[name]
      : candidate.manifests.get(name)?.manifest.version;
    const instances = installation.instances.filter((instance) => instance.name === name);
    assert.ok(instances.length > 0, `Missing selected native owner ${name}`);
    for (const instance of instances) assert.equal(instance.version, expected);
  }
  return installation;
});
