import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runLocal } from "./src/commands/local.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("manages detached project services and protects live attached leases", async () => {
  const root = await localProject();
  const up = capture();
  const upCode = await runLocal(["up", "--detach", "--project-root", root], up.context);
  expect(up.errors).toEqual([]);
  expect(upCode).toBe(0);
  expect(up.outputs[0]).toMatchObject({
    ok: true,
    command: "up",
    detached: true,
    services: [expect.objectContaining({ phase: "healthy" })],
  });

  const status = capture();
  expect(await runLocal(["status", "--project-root", root], status.context)).toBe(0);
  expect(status.outputs[0]).toMatchObject({
    ownership: { mode: "detached", blocked: false },
    services: [expect.objectContaining({ phase: "healthy", containerState: "running" })],
  });

  const localPath = Bun.resolveSync("@relkit/local/runtime", root);
  const local = await import(pathToFileURL(localPath).href);
  const identity = local.createLocalProjectIdentity(root, "local-cli");
  const attached = local.acquireLocalProjectLease(identity, {
    mode: "attached",
    sessionId: "test-live-owner",
  });
  const blocked = capture();
  expect(await runLocal(["stop", "--project-root", root], blocked.context)).toBe(1);
  expect(blocked.errors[0]).toMatchObject({ code: "RELKIT_LOCAL_LEASE_HELD" });
  attached.release();

  const stopped = capture();
  expect(await runLocal(["stop", "--project-root", root], stopped.context)).toBe(0);
  expect(stopped.outputs[0]).toMatchObject({
    command: "stop",
    containers: 1,
    volumesRemoved: false,
  });

  expect(await runLocal(["up", "--detach", "--project-root", root], capture().context)).toBe(0);
  const reset = capture();
  expect(await runLocal(["reset", "--yes", "--project-root", root], reset.context)).toBe(0);
  expect(reset.outputs[0]).toMatchObject({
    command: "reset",
    containers: 1,
    volumesRemoved: true,
  });
  const fake = await import(
    pathToFileURL(join(root, "node_modules/@relkit/docker/runtime.js")).href
  );
  expect(fake.fakeDockerState).toEqual({ services: [], volumeRemovals: 1 });
});

async function localProject(): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".relkit-local-cli-"));
  roots.push(root);
  await cp(join(process.cwd(), "tests/compiler/fixtures/valid-minimal"), root, {
    recursive: true,
  });
  await cp(join(process.cwd(), "examples/commerce/package.json"), join(root, "package.json"));
  await writeFile(
    join(root, "relkit.config.ts"),
    `import { defineApp, defineEnv } from "@relkit/app";
import { docker } from "@relkit/docker";
import { redis } from "@relkit/redis";
export default defineApp({ id: "local-cli", env: defineEnv({}), cache: docker(redis()) });
`,
  );
  const scope = join(root, "node_modules", "@relkit");
  await mkdir(scope, { recursive: true });
  for (const name of ["app", "local", "redis", "schema"])
    await symlink(
      resolve(
        process.cwd(),
        name === "app" || name === "schema" ? `packages/${name}` : `integrations/packages/${name}`,
      ),
      join(scope, name),
    );
  await fakeDockerPackage(join(scope, "docker"));
  return root;
}

async function fakeDockerPackage(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const actual = resolve(process.cwd(), "integrations/packages/docker/dist/index.js");
  await writeFile(
    join(root, "index.js"),
    `export { docker } from ${JSON.stringify(pathToFileURL(actual).href)};\n`,
  );
  await writeFile(
    join(root, "index.d.ts"),
    await readFile(resolve(process.cwd(), "integrations/packages/docker/dist/index.d.ts"), "utf8"),
  );
  await writeFile(join(root, "runtime.js"), fakeRuntimeSource());
  await writeFile(
    join(root, "runtime.d.ts"),
    "export declare function createDockerMaterializer(): unknown;\n",
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "@relkit/docker",
      version: "0.1.0-test",
      type: "module",
      exports: {
        ".": { types: "./index.d.ts", import: "./index.js" },
        "./runtime": { types: "./runtime.d.ts", import: "./runtime.js" },
      },
      relkit: {
        integration: {
          id: "docker",
          exports: { authoring: ".", localMaterializer: "./runtime" },
        },
      },
    }),
  );
}

function fakeRuntimeSource(): string {
  return `export const fakeDockerState = { services: [], volumeRemovals: 0 };
export function createDockerMaterializer() {
  return Object.freeze({
    kind: "local-service-materializer-runtime", protocolVersion: 1, integrationId: "docker",
    list: async (labels) => fakeDockerState.services.filter((service) => Object.entries(labels).every(([key, value]) => service.labels[key] === value)),
    start: async (request) => {
      const ports = Object.fromEntries(Object.keys(request.recipe.ports).map((name, index) => [name, 49153 + index]));
      const service = { id: "container-" + (fakeDockerState.services.length + 1), name: request.name, labels: request.labels, state: "running", health: "healthy", ports };
      fakeDockerState.services.push(service);
      return service;
    },
    remove: async (id) => { fakeDockerState.services.splice(fakeDockerState.services.findIndex((service) => service.id === id), 1); },
    removeVolumes: async () => { fakeDockerState.volumeRemovals += 1; },
  });
}
`;
}

function capture() {
  const outputs: unknown[] = [];
  const errors: Array<{ code: string; message: string }> = [];
  return {
    outputs,
    errors,
    context: {
      json: true,
      tty: false,
      signal: new AbortController().signal,
      reporter: {
        output: (value: unknown) => outputs.push(value),
        error: (code: string, message: string) => errors.push({ code, message }),
      },
    },
  };
}
