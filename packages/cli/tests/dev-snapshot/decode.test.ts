/**
 * Exercises receipt rejection before any filesystem or executable authority is
 * available. Fixtures keep hashes syntactically valid while corrupting cohort
 * references, paths and bounds so decoding cannot confuse structure with trust.
 */
import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import {
  decodeSnapshotEffect,
  MAX_SNAPSHOT_RECEIPT_BYTES,
} from "../../src/dev-snapshot/snapshot-decode.js";

const hash = `sha256:${"a".repeat(64)}`;
const otherHash = `sha256:${"b".repeat(64)}`;
const artifacts = [
  "graph.json",
  "activation.json",
  "server.js",
  "imports.json",
  "manifest.ts",
  "integrations.json",
].map((path) => ({ path, hash, bytes: 1 }));
const receipt = {
  version: 1,
  fingerprint: hash,
  graphHash: hash,
  graphFile: "graph.json",
  activationFile: "activation.json",
  manifestFile: "manifest.ts",
  runtimeIntegrationsFile: "integrations.json",
  entrypoint: "server.js",
  importIndex: "imports.json",
  activation: { graphHash: hash, manifestHash: hash, runtimeIntegrationsPlanHash: hash },
  tools: {
    bun: "1.3.10",
    effect: "4.0.1",
    typescript: "5.9.3",
    relkit: "0.7.2",
    platform: "darwin-arm64",
  },
  readiness: {
    kind: "route",
    path: "/hello?name=RelKit",
    status: 200,
    body: '{"message":"Hello, RelKit!"}',
  },
  inputs: [{ path: "src/app.ts", hash, bytes: 1 }],
  typecheckInputs: { files: [{ path: "src/app.ts", hash, bytes: 1 }], observations: [] },
  dependencies: [],
  artifacts,
  routeImports: [{ routeId: "route.hello", members: ["server.js"] }],
};

it.effect("decodes a portable receipt without requesting native authority", () =>
  Effect.gen(function* () {
    expect(yield* decodeSnapshotEffect(JSON.stringify(receipt))).toEqual(receipt);
  }),
);

it.effect("rejects escaped and ambiguous runtime paths", () =>
  Effect.gen(function* () {
    for (const path of [
      "../server.js",
      "/server.js",
      "server/../../entry.js",
      "C:\\entry.js",
      "server//entry.js",
      "./server.js",
      "server\u0000.js",
    ]) {
      const exit = yield* Effect.exit(
        decodeSnapshotEffect(JSON.stringify({ ...receipt, entrypoint: path })),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }
  }),
);

it.effect("rejects mixed cohorts, unindexed deferred members and duplicate inventories", () =>
  Effect.gen(function* () {
    const malformed = [
      { ...receipt, activation: { ...receipt.activation, graphHash: otherHash } },
      { ...receipt, routeImports: [{ routeId: "route.hello", members: ["unverified.js"] }] },
      { ...receipt, artifacts: [...artifacts, artifacts[0]] },
      { ...receipt, inputs: [{ path: ".env", hash, bytes: 1 }] },
      { ...receipt, inputs: [{ path: "nested/.env.private", hash, bytes: 1 }] },
      { ...receipt, graphFile: receipt.entrypoint },
      {
        ...receipt,
        typecheckInputs: { ...receipt.typecheckInputs, files: [{ path: ".env", hash, bytes: 1 }] },
      },
      {
        ...receipt,
        typecheckInputs: {
          ...receipt.typecheckInputs,
          observations: [{ kind: "fileExists", path: "../outside.d.ts", exists: false }],
        },
      },
    ];
    for (const value of malformed) {
      expect(Exit.isFailure(yield* Effect.exit(decodeSnapshotEffect(JSON.stringify(value))))).toBe(
        true,
      );
    }
  }),
);

it.effect("rejects truncated, unsupported and oversized receipts", () =>
  Effect.gen(function* () {
    for (const source of [
      "{",
      JSON.stringify({ ...receipt, version: 2 }),
      " ".repeat(MAX_SNAPSHOT_RECEIPT_BYTES + 1),
    ]) {
      const exit = yield* Effect.exit(decodeSnapshotEffect(source));
      expect(Exit.isFailure(exit)).toBe(true);
    }
  }),
);

it.effect(
  "allows builtin resolution probes while rejecting escaped or drive-prefixed queries",
  () =>
    Effect.gen(function* () {
      for (const path of ["node:fs.ts", "bun:ffi", "node_modules/node:fs.ts", "."]) {
        const value = {
          ...receipt,
          typecheckInputs: {
            ...receipt.typecheckInputs,
            observations: [{ kind: "fileExists", path, exists: false }],
          },
        };
        expect(yield* decodeSnapshotEffect(JSON.stringify(value))).toEqual(value);
      }
      for (const path of [
        "C:entry.ts",
        "C:/entry.ts",
        "../node:fs",
        "/node:fs",
        "node:fs/../x",
        "node:fs\\x",
      ]) {
        const value = {
          ...receipt,
          typecheckInputs: {
            ...receipt.typecheckInputs,
            observations: [{ kind: "fileExists", path, exists: false }],
          },
        };
        expect(
          Exit.isFailure(yield* Effect.exit(decodeSnapshotEffect(JSON.stringify(value)))),
        ).toBe(true);
      }
    }),
);
