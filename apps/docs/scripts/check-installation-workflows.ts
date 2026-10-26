/** Runs bounded documentation journeys against one packed candidate; requires package builds first and never substitutes workspace node_modules or example manifests. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import { scaffoldProcessLayer } from "../../../scripts/scaffold-process.js";
import { installationWorkflow } from "./installation-workflow-context.js";
import { minimalWorkflow } from "./installation-workflow-backend.js";
import { ordersWorkflow } from "./installation-workflow-orders.js";
import { transportsWorkflow } from "./installation-workflow-transports.js";
import { agentWorkflow } from "./installation-workflow-agent.js";
import { frontendWorkflow } from "./installation-workflow-frontend.js";
import { inspectorWorkflow } from "./installation-workflow-inspector.js";
import { providersWorkflow } from "./installation-workflow-providers.js";

/** Executes each actual native journey once and records its bounded acceptance scope.
 * @returns Lazy sequential acceptance, requiring existing process and resource scopes.
 */
const checkInstallations = Effect.gen(function* () {
  const context = yield* installationWorkflow;
  const minimal = yield* minimalWorkflow(context);
  yield* ordersWorkflow(context);
  yield* agentWorkflow(context);
  yield* transportsWorkflow(context);
  yield* frontendWorkflow(context, minimal);
  yield* providersWorkflow(context);
  yield* inspectorWorkflow(context, minimal);
  const artifacts = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))(
    yield* inspectionNative("docs.artifact-identities", () =>
      readFile(join(context.artifacts, "manifest.json"), "utf8"),
    ),
  );
  const report = {
    passed: true,
    isolatedPackedConsumers: true,
    artifacts,
    journeys: [
      "minimal-production",
      "sqlite-auth-restart",
      "offline-native-agent",
      "mcp-selected-transports",
      "frontend-contract-types",
      "providers-config-deploy-phases",
      "standalone-inspector-history",
    ],
    packages: Object.fromEntries(
      [...context.catalog.packages].map(([name, manifest]) => [name, manifest.version]),
    ),
    excluded: [
      "cloud provisioning",
      "Docker lifecycle",
      "native provider certification",
      "paid models",
      "performance acceptance",
    ],
  };
  yield* inspectionNative("docs.installation-report", async () => {
    const directory = join(context.repository, ".relkit");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "docs-installations.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  });
  yield* Effect.logInfo("All seven packed documentation installation journeys passed");
});

if (import.meta.main) {
  await Effect.runPromise(
    checkInstallations.pipe(
      Effect.provide(scaffoldProcessLayer),
      Effect.scoped,
      Effect.timeout("20 minutes"),
    ),
  );
}
