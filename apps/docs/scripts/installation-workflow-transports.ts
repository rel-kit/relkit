/** Exercises tool-only MCP and independently selected HTTP transports, then pulls a contract into a separate React consumer without backend source imports. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import {
  createWorkflowProject,
  copyWorkflowSource,
  installWorkflowGuide,
  workflowCommand,
  verifyWorkflowClosure,
} from "./installation-workflow-project.js";
import { startWorkflowDev } from "./installation-workflow-runtime.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Adds one literal server selection while preserving the creator's other configuration fields.
 * @param app - Owned consumer configuration.
 * @param fields - Explicit fields taught by the selected guide.
 * @returns Completion after the source change; changed template shape fails closed.
 */
export const selectWorkflowServer = (app: string, fields: string) =>
  inspectionNative("docs.server-selection", async () => {
    const path = join(app, "relkit.config.ts");
    const source = await readFile(path, "utf8");
    assert(source.includes("server: {"), "Creator server region changed");
    await writeFile(path, source.replace("server: {", `server: { ${fields},`));
  });

/** Requires the native build's selected-dependency diagnostic before installing the missing SDK.
 * @param context - Candidate command owner.
 * @param app - App explicitly selecting an absent optional transport.
 * @param name - Missing package expected in the native diagnostic.
 * @returns Completion only when build rejects that exact missing SDK.
 */
const missingTransport = Effect.fn("DocsInstallation.missing-transport")(function* (
  context: InstallationWorkflow,
  app: string,
  name: string,
) {
  const result = yield* Effect.exit(workflowCommand(context, app, ["run", "build"]));
  assert(Exit.isFailure(result), "Missing selected transport was silently accepted");
  const diagnostic = JSON.stringify(result);
  assert(
    diagnostic.includes(name) && diagnostic.includes("RELKIT_DEPENDENCY_MISSING"),
    "Expected selected SDK diagnostic",
  );
});

/** Establishes MCP tools/list over the actual native server without installing a model engine.
 * @param context - Packed cohort.
 * @returns Completion after MCP discovery and independent Scalar/AG-UI preflight controls.
 */
export const transportsWorkflow = Effect.fn("DocsInstallation.transports")(function* (
  context: InstallationWorkflow,
) {
  const app = yield* createWorkflowProject(context, "transports");
  yield* copyWorkflowSource(
    context,
    app,
    "templates/default/v1/agent/src/services/hello/tools/lookup.tool.ts",
    "src/services/hello/tools/lookup.tool.ts",
  );
  yield* selectWorkflowServer(app, "mcp: true");
  yield* missingTransport(context, app, "@modelcontextprotocol/server");
  yield* installWorkflowGuide(context, app, "mcp");
  yield* workflowCommand(context, app, ["run", "check"]);
  yield* workflowCommand(context, app, ["run", "typecheck"]);
  yield* verifyWorkflowClosure(
    context,
    app,
    /^(?:langchain|deepagents|@langchain\/.*|@ag-ui\/core|@scalar\/hono-api-reference|@relkit\/(?:langchain|drizzle|better-auth|inspector))$/,
  );
  yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* startWorkflowDev(context, app);
      yield* verifyMcp(server.origin);
    }),
  );
  yield* selectWorkflowServer(app, 'apiDocs: { ui: "scalar", enabledInProduction: true }');
  yield* missingTransport(context, app, "@scalar/hono-api-reference");
  yield* installWorkflowGuide(context, app, "scalar");
  yield* workflowCommand(context, app, ["run", "build"]);
  yield* selectWorkflowServer(app, "agUi: true");
  yield* missingTransport(context, app, "@ag-ui/core");
  yield* installWorkflowGuide(context, app, "ag-ui");
  yield* workflowCommand(context, app, ["run", "build"]);
});

/** Uses native Streamable HTTP JSON-RPC without adding an unrelated client SDK to the backend.
 * @param origin - Live tool-only backend.
 * @returns Completion after initialized discovery exposes the greeting tool.
 */
const verifyMcp = (origin: string) =>
  inspectionNative("docs.mcp-http", async () => {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    const initialized = await fetch(origin + "/mcp", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "docs-installation", version: "1" },
        },
      }),
    });
    const initialization = await initialized.text();
    assert(initialized.ok, initialization);
    const session = initialized.headers.get("mcp-session-id");
    const response = await fetch(origin + "/mcp", {
      method: "POST",
      headers: { ...headers, ...(session ? { "mcp-session-id": session } : {}) },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    const body = await response.text();
    assert(response.ok && body.includes("hello.lookup"), body);
  });
