/** Executes compiler-bound original descriptors, nested publications, receiver delivery and admission failures from one actual paired source tree. */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Schema } from "effect";
import { validateGraphShape, type ApplicationGraph } from "../../../packages/graph/src/index.js";
import { createFunctionRegistry, invoke } from "../../../packages/engine/src/index.js";
import { createTestRuntime } from "../../../packages/testing/src/index.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

const root = join(process.cwd(), "examples/commerce");

test(
  "paired native events preserve nested publication, receiver ownership and event-only admission",
  () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const graph = yield* scaffoldNative("commerce.events.graph", async () => {
            const value = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(
              await Bun.file(join(root, ".relkit/generated/application.graph.json")).text(),
            );
            if (!isApplicationGraph(value)) throw new Error("Invalid native compiler graph");
            return value;
          });
          const manifest = yield* scaffoldNative("commerce.events.manifest", () =>
            loadManifest(root),
          );
          const registry = createFunctionRegistry(graph, manifest);
          const runtime = yield* Effect.acquireRelease(
            Effect.sync(() => createTestRuntime({ registry })),
            (runtime) =>
              scaffoldNative("commerce.events.close", () => runtime.close()).pipe(Effect.orDie),
          );
          const observed: { orderId: string }[] = [];
          runtime.fakes.setClient("events", "orders.layout-created", {
            publish: async (input: { orderId: string }) => {
              observed.push(input);
              return { accepted: true, instanceId: "layout-event" };
            },
          });
          for (const id of ["orders.layout-publish", "orders.layout-nested"]) {
            const target = registry.targets[id];
            if (!target) throw new Error("Original compiler-bound publisher is missing");
            yield* scaffoldNative("commerce.events.publish", () =>
              runtime.invoke(target, { orderId: id }),
            );
          }
          expect(observed).toEqual([
            { orderId: "orders.layout-publish" },
            { orderId: "orders.layout-nested" },
          ]);
          const receiver = graph.nodes.find(
            (node) => node.kind === "function" && node.id === "receipts.layout-delivery",
          );
          expect(receiver).toMatchObject({ domainId: "receipts", invocationMode: "event-only" });
          yield* verifyDelivery(registry);
          yield* verifyDeclaredError(registry);
        }),
      ),
    ),
  15_000,
);

/**
 * Borrows the actual generated manifest after checking the dynamic module boundary; native registry validation retains graph and executable authority.
 * @param root - Owned application with native generated outputs.
 * @returns The unchanged original manifest object.
 */
async function loadManifest(root: string): Promise<Parameters<typeof createFunctionRegistry>[1]> {
  const namespace = await import(
    pathToFileURL(join(root, ".relkit/generated/runtime.manifest.ts")).href
  );
  const value = Reflect.get(namespace, "runtimeManifest");
  if (typeof value !== "object" || value === null) throw new Error("Missing native manifest");
  for (const key of ["functions", "targets", "runtimeIntegrationsPlan", "activationFingerprint"]) {
    const field = Reflect.get(value, key);
    if (typeof field !== "object" || field === null)
      throw new Error("Missing native manifest authority");
  }
  // This is the native generated module ABI; createFunctionRegistry validates the complete cohort before use.
  return value as Parameters<typeof createFunctionRegistry>[1];
}

/**
 * Uses the authoritative validator before granting the serialized native graph's static projection.
 * @typeParam Value - Original parsed compiler output.
 * @param value - Actual generated graph document.
 * @returns Whether its complete native graph contract validated.
 */
function isApplicationGraph<Value>(value: Value): value is Value & ApplicationGraph {
  validateGraphShape(value);
  return true;
}

/**
 * Executes delivery/replay and rejects direct/HTTP/job/tool/agent admission before receiver execution.
 * @param registry - Native compiler-bound function registry.
 * @returns Completion with unchanged validation and invocation-mode outcomes.
 */
const verifyDelivery = Effect.fn("CommerceEvents.delivery")(function* (
  registry: ReturnType<typeof createFunctionRegistry>,
) {
  for (const source of ["event-delivery", "event-replay"] as const)
    yield* scaffoldNative("commerce.events.delivery", () =>
      invoke({
        registry,
        functionId: "receipts.layout-delivery",
        input: { orderId: "delivered" },
        source,
      }),
    );
  for (const source of ["direct", "http", "job", "tool", "agent"] as const) {
    const outcome = yield* Effect.exit(
      scaffoldNative("commerce.events.denied", () =>
        invoke({
          registry,
          functionId: "receipts.layout-delivery",
          input: { orderId: "denied" },
          source,
        }),
      ),
    );
    expect(outcome._tag).toBe("Failure");
  }
  const invalid = yield* Effect.exit(
    scaffoldNative("commerce.events.invalid", () =>
      invoke({
        registry,
        functionId: "receipts.layout-delivery",
        input: { orderId: 1 },
        source: "event-delivery",
      }),
    ),
  );
  expect(invalid._tag).toBe("Failure");
});

/**
 * Executes the maintained receipt descriptor's declared failure and native input validation through its resolved ID.
 * @param registry - Original compiler-bound executable registry.
 * @returns Completion after precise error identity/data and validation denial are observed.
 */
const verifyDeclaredError = Effect.fn("CommerceEvents.declaredError")(function* (
  registry: ReturnType<typeof createFunctionRegistry>,
) {
  yield* scaffoldNative("commerce.errors.declared", async () => {
    await expect(
      invoke({
        registry,
        functionId: "receipts.send-receipt",
        input: { orderId: "one", receiptKey: "one.json" },
        clients: {
          buckets: {
            receipts: {
              put: async () => {
                throw new Error("Test-owned storage failure");
              },
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      kind: "application",
      id: "receipts.storage-unavailable",
      data: { receiptKey: "one.json" },
    });
  });
  yield* scaffoldNative("commerce.errors.validation", async () => {
    await expect(
      invoke({
        registry,
        functionId: "receipts.send-receipt",
        input: { orderId: 1, receiptKey: "invalid" },
      }),
    ).rejects.toMatchObject({ code: "RELKIT_INPUT_VALIDATION" });
  });
});
