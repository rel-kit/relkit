/** Owns native dev fixture roots and manually acquired SDK sessions in the test-runner's Effect scope. */
import { afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Context, Effect, Layer, ManagedRuntime, Scope } from "effect";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import {
  API_BASE_PATH,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  GENERATOR_VERSION,
  type RuntimeActivationFingerprint,
} from "@relkit/contracts";
import type { startDev, DevOptions } from "../../../packages/cli/src/commands/dev.js";

/** The runner's scope owns roots and admits existing SDK sessions without changing their identity. */
class DevFixture extends Context.Service<DevFixture>()("relkit.tests.DevFixture", {
  make: Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    return {
      root: fixtureRoot.pipe(Effect.provideService(Scope.Scope, scope)),
      session: (session: Awaited<ReturnType<typeof startDev>>) =>
        Effect.acquireRelease(Effect.succeed(session), (session) =>
          scaffoldNative("dev.fixture.session.release", () => session.stop()).pipe(Effect.orDie),
        ).pipe(Effect.provideService(Scope.Scope, scope), Effect.asVoid),
    };
  }),
}) {}
let owner: ManagedRuntime.ManagedRuntime<DevFixture, never> | undefined;

/**
 * Registers native cleanup in the consuming suite, retaining session-before-root release in every file.
 * @returns Hook registration; teardown joins the managed scope before another case acquires a root.
 */
export function registerDevCleanup(): void {
  afterEach(async () => {
    const current = owner;
    owner = undefined;
    await current?.dispose();
  });
}

/**
 * Gets the native runner-owned scope only when a case acquires its first root.
 * @returns The fixture runtime joined by afterEach.
 */
function fixtureOwner() {
  return (owner ??= ManagedRuntime.make(Layer.effect(DevFixture, DevFixture.make)));
}

const fixtureRoot = Effect.acquireRelease(
  scaffoldNative("dev.fixture.root", () => mkdtemp(join(tmpdir(), "relkit-dev-"))),
  (root) =>
    scaffoldNative("dev.fixture.root.release", () =>
      rm(root, { recursive: true, force: true }),
    ).pipe(Effect.orDie),
);

/**
 * Acquires an exclusive root before a native case writes its simulated compiler output.
 * @returns A root released only after adopted native dev sessions stop.
 */
export function makeRoot(): Promise<string> {
  return fixtureOwner().runPromise(DevFixture.use((fixture) => fixture.root));
}

/**
 * Registers ownership immediately after the public SDK's manual acquisition returns.
 * @param session - Original SDK session, never cloned or replaced.
 * @returns Admission completion; explicit stop remains idempotent with runner cleanup.
 */
export function adoptSession(session: Awaited<ReturnType<typeof startDev>>): Promise<void> {
  return fixtureOwner().runPromise(DevFixture.use((fixture) => fixture.session(session)));
}

/**
 * Builds the existing native fake-compiler policy without exposing extra host authority.
 * @param root - Test-owned source/output root.
 * @param graphHash - Exact native activation identity expected by the proxy.
 * @returns Original SDK options with one finite source emitter and quiet native diagnostics.
 */
export function options(root: string, graphHash: string): DevOptions {
  return {
    projectRoot: root,
    activationFingerprint: fingerprint(graphHash),
    stablePort: 0,
    installSignalHandlers: false,
    inspector: false,
    logger: { human: false, json: false },
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(entrypoint, serverSource(graphHash));
      return { entrypoint };
    },
  };
}

/**
 * Emits the controlled native SDK readiness protocol for a fake compiler.
 * @param graphHash - Accepted graph identity.
 * @returns Complete Bun server source preserving runtime cohort and public route responses.
 */
export function serverSource(graphHash: string): string {
  return `const hash = ${JSON.stringify(graphHash)};
const activationFingerprint = ${JSON.stringify(fingerprint(graphHash))};
Bun.serve({ port: Number(process.env.PORT), fetch(request) {
  const path = new URL(request.url).pathname;
  const identity = { sourceToken: Number(process.env.RELKIT_SOURCE_TOKEN), generationToken: Number(process.env.RELKIT_GENERATION_TOKEN) };
  const headers = { "content-type": "application/json", "x-relkit-api-version": "1" };
  if (path === "/hello") { console.log("backend hello"); return new Response("hello"); }
  if (path === "${API_BASE_PATH}/health/live") return Response.json({ protocol: "relkit.inspector", version: 1, status: "ok", activationFingerprint, ...identity }, { headers });
  if (path === "${API_BASE_PATH}/graph") return Response.json({ protocol: "relkit.inspector", version: 1, graphHash: hash, activationFingerprint, manifestGraphHash: hash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, ...identity }, { headers });
  if (path === "${API_BASE_PATH}/health/ready") return Response.json({ protocol: "relkit.inspector", version: 1, status: "ready", activationFingerprint, environmentReady: true, providerReady: true, ...identity }, { headers });
  return new Response("not found", { status: 404 });
}});`;
}

/**
 * Supplies a complete native cohort so tests cannot skip SDK activation verification.
 * @param graphHash - Accepted graph identity.
 * @returns Matching graph, manifest and runtime-integration identities.
 */
export function fingerprint(graphHash: string): RuntimeActivationFingerprint {
  return {
    graphHash,
    manifestHash: graphHash + ":manifest",
    runtimeIntegrationsPlanHash: graphHash + ":runtime-integrations",
  };
}

/**
 * Waits on observed native state rather than assuming an independent support child is ready with the backend.
 * @param check - Borrowed synchronous state observation.
 * @param observation - Native state whose absence explains a bounded failure.
 * @returns Completion after the state is observed, or a bounded test failure.
 */
export async function waitFor(
  check: () => boolean,
  observation = "native dev state",
): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (check()) return;
    await Bun.sleep(25);
  }
  throw new Error(`Timed out waiting for ${observation}`);
}
