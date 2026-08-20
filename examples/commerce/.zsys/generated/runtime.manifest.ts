import { createGeneratedAgentFunction as __zsys_createGeneratedAgentFunction } from "@zsys/agents";
import { createEventListenerTarget as __zsys_createEventListenerTarget } from "@zsys/events";
import * as __zsys_module_0 from "../../src/agents/order-support.agent.ts";
import * as __zsys_module_1 from "../../src/app.ts";
import * as __zsys_module_2 from "../../src/events/order-audit.event.ts";
import * as __zsys_module_3 from "../../src/events/order-cancelled.event.ts";
import * as __zsys_module_4 from "../../src/events/order-created.event.ts";
import * as __zsys_module_5 from "../../src/events/order-projector.event.ts";
import * as __zsys_module_6 from "../../src/events/order-receipt.event.ts";
import * as __zsys_module_7 from "../../src/events/order-updated.event.ts";
import * as __zsys_module_8 from "../../src/events/telemetry.event.ts";
import * as __zsys_module_9 from "../../src/functions/authorize-order.function.ts";
import * as __zsys_module_10 from "../../src/functions/browse-path.function.ts";
import * as __zsys_module_11 from "../../src/functions/create-order.function.ts";
import * as __zsys_module_12 from "../../src/functions/delete-order.function.ts";
import * as __zsys_module_13 from "../../src/functions/get-order.function.ts";
import * as __zsys_module_14 from "../../src/functions/search-orders.function.ts";
import * as __zsys_module_15 from "../../src/functions/send-receipt.function.ts";
import * as __zsys_module_16 from "../../src/functions/update-order.function.ts";
import * as __zsys_module_17 from "../../src/functions/upload-assets.function.ts";
import * as __zsys_module_18 from "../../src/routes/orders/[orderId]/route.ts";
import * as __zsys_module_19 from "../../src/tools/lookup-order.tool.ts";

export const manifestContractVersion = 1 as const;
export const manifestGeneratorVersion = 1 as const;
export const manifestGraphHash = "sha256:b994bcaad359a15df752bb2e296087b8d7e1b297528ab7b596ceea80f425898e" as const;
export const providerFactories = { "aws": { recipeTag: "aws", factory: undefined }, "local": { recipeTag: "local", factory: undefined }, "test": { recipeTag: "test", factory: undefined } } as const;
const __zsys_middleware_0 = Object.assign((...args: any[]) => (__zsys_module_9["default"].handler as (...values: any[]) => any)(...args), { targetFunctionId: "orders.authorize", request: {"fields":{"authorization":{"kind":"header","name":"authorization"}},"kind":"input"}, decision: {"kind":"continue"} });
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "assets.upload": __zsys_module_17["default"].handler, "content.browse-path": __zsys_module_10["default"].handler, "orders.authorize": __zsys_module_9["default"].handler, "orders.create": __zsys_module_11["default"].handler, "orders.delete": __zsys_module_12["default"].handler, "orders.get": __zsys_module_13["default"].handler, "orders.search": __zsys_module_14["default"].handler, "orders.update": __zsys_module_16["default"].handler, "receipts.send": __zsys_module_15["default"].handler, "zsys.agent.support.order.invoke": __zsys_createGeneratedAgentFunction("support.order"), "zsys.event.orders.audit-changes.handler": __zsys_module_2["default"].target.handler, "zsys.event.orders.project-any-change.handler": __zsys_module_5["default"].target.handler, "zsys.event.receipts.on-order-created.handler": __zsys_module_6["default"].target.handler, "zsys.event.telemetry.capture-events.handler": __zsys_module_8["default"].target.handler },
  targets: { "assets.upload": __zsys_module_17["default"], "content.browse-path": __zsys_module_10["default"], "orders.authorize": __zsys_module_9["default"], "orders.create": __zsys_module_11["default"], "orders.delete": __zsys_module_12["default"], "orders.get": __zsys_module_13["default"], "orders.search": __zsys_module_14["default"], "orders.update": __zsys_module_16["default"], "receipts.send": __zsys_module_15["default"], "zsys.event.orders.audit-changes.handler": __zsys_createEventListenerTarget(__zsys_module_2["default"], [__zsys_module_3["default"], __zsys_module_4["default"], __zsys_module_7["default"]], "zsys.event.orders.audit-changes.handler"), "zsys.event.orders.project-any-change.handler": __zsys_createEventListenerTarget(__zsys_module_5["default"], [__zsys_module_3["default"], __zsys_module_4["default"], __zsys_module_7["default"]], "zsys.event.orders.project-any-change.handler"), "zsys.event.receipts.on-order-created.handler": __zsys_createEventListenerTarget(__zsys_module_6["default"], [__zsys_module_4["default"]], "zsys.event.receipts.on-order-created.handler"), "zsys.event.telemetry.capture-events.handler": __zsys_createEventListenerTarget(__zsys_module_8["default"], [__zsys_module_3["default"], __zsys_module_4["default"], __zsys_module_7["default"]], "zsys.event.telemetry.capture-events.handler") },
  agents: { "support.order": __zsys_module_0["default"] },
  tools: { "orders.get.tool": __zsys_module_19["default"] },
  providers: providerFactories,
  providerFactories,
  middleware: { "orders.auth": __zsys_middleware_0 },
  requestTransforms: { "orders.normalize-id": __zsys_module_18["normalizeOrderId"].schema },
  application: __zsys_module_1["default"],
} as const;
