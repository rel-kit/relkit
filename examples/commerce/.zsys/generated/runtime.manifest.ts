import { bindDescriptorIdentity as __zsys_bindDescriptorIdentity } from "@zsys/invocation";
import { createGeneratedAgentFunction as __zsys_createGeneratedAgentFunction } from "@zsys/agents";
import { createEventListenerTarget as __zsys_createEventListenerTarget } from "@zsys/events";
import * as __zsys_module_0 from "../../src/agents/order-support.agent.ts";
import * as __zsys_module_1 from "../../src/app.ts";
import * as __zsys_module_2 from "../../src/buckets/assets.bucket.ts";
import * as __zsys_module_3 from "../../src/cache/prices.cache.ts";
import * as __zsys_module_4 from "../../src/events/order-audit.event.ts";
import * as __zsys_module_5 from "../../src/events/order-cancelled.event.ts";
import * as __zsys_module_6 from "../../src/events/order-created.event.ts";
import * as __zsys_module_7 from "../../src/events/order-projector.event.ts";
import * as __zsys_module_8 from "../../src/events/order-receipt.event.ts";
import * as __zsys_module_9 from "../../src/events/order-updated.event.ts";
import * as __zsys_module_10 from "../../src/events/telemetry.event.ts";
import * as __zsys_module_11 from "../../src/functions/authorize-order.function.ts";
import * as __zsys_module_12 from "../../src/functions/browse-path.function.ts";
import * as __zsys_module_13 from "../../src/functions/orders/create-order.function.ts";
import * as __zsys_module_14 from "../../src/functions/orders/delete-order.function.ts";
import * as __zsys_module_15 from "../../src/functions/orders/get-order.function.ts";
import * as __zsys_module_16 from "../../src/functions/orders/search-orders.function.ts";
import * as __zsys_module_17 from "../../src/functions/orders/update-order.function.ts";
import * as __zsys_module_18 from "../../src/functions/send-receipt.function.ts";
import * as __zsys_module_19 from "../../src/functions/upload-assets.function.ts";
import * as __zsys_module_20 from "../../src/jobs/send-receipt.job.ts";
import * as __zsys_module_21 from "../../src/middleware/order-auth.middleware.ts";
import * as __zsys_module_22 from "../../src/routes/docs/[[...parts]]/route.ts";
import * as __zsys_module_23 from "../../src/routes/files/[...parts]/route.ts";
import * as __zsys_module_24 from "../../src/routes/orders/[orderId]/route.ts";
import * as __zsys_module_25 from "../../src/routes/orders/route.ts";
import * as __zsys_module_26 from "../../src/routes/orders/search/route.ts";
import * as __zsys_module_27 from "../../src/routes/uploads/route.ts";
import * as __zsys_module_28 from "../../src/services/orders.service.ts";
import * as __zsys_module_29 from "../../src/tools/lookup-order.tool.ts";
import * as __zsys_module_30 from "../../src/transforms/orders/normalize-id.transform.ts";

__zsys_bindDescriptorIdentity(__zsys_module_0["default"], "order-support");
__zsys_bindDescriptorIdentity(__zsys_module_1["default"], "commerce-api");
__zsys_bindDescriptorIdentity(__zsys_module_2["default"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_3["default"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_4["default"], "orders.audit-changes");
__zsys_bindDescriptorIdentity(__zsys_module_4["default"]["target"], "zsys.event.orders.audit-changes.handler");
__zsys_bindDescriptorIdentity(__zsys_module_5["default"], "orders.cancelled");
__zsys_bindDescriptorIdentity(__zsys_module_6["default"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_7["default"], "orders.project-any-change");
__zsys_bindDescriptorIdentity(__zsys_module_7["default"]["target"], "zsys.event.orders.project-any-change.handler");
__zsys_bindDescriptorIdentity(__zsys_module_8["default"], "receipts.on-order-created");
__zsys_bindDescriptorIdentity(__zsys_module_8["default"]["target"], "zsys.event.receipts.on-order-created.handler");
__zsys_bindDescriptorIdentity(__zsys_module_8["default"]["target"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_8["default"]["target"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_9["default"], "orders.updated");
__zsys_bindDescriptorIdentity(__zsys_module_10["default"], "telemetry.capture-events");
__zsys_bindDescriptorIdentity(__zsys_module_10["default"]["target"], "zsys.event.telemetry.capture-events.handler");
__zsys_bindDescriptorIdentity(__zsys_module_11["default"], "authorize-order");
__zsys_bindDescriptorIdentity(__zsys_module_12["default"], "browse-path");
__zsys_bindDescriptorIdentity(__zsys_module_13["default"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_13["default"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_13["default"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_13["default"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_13["default"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_13["default"]["dependencies"]["jobs"]["sendReceiptJob"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_14["default"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_16["default"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_17["default"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_18["default"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_18["default"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_19["default"], "upload-assets");
__zsys_bindDescriptorIdentity(__zsys_module_20["default"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_20["default"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_20["default"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_21["default"], "order-auth");
__zsys_bindDescriptorIdentity(__zsys_module_21["default"]["target"], "authorize-order");
__zsys_bindDescriptorIdentity(__zsys_module_22["GET"], "route.get.docs.optional-catch-all-parts");
__zsys_bindDescriptorIdentity(__zsys_module_22["GET"]["target"], "browse-path");
__zsys_bindDescriptorIdentity(__zsys_module_23["GET"], "route.get.files.catch-all-parts");
__zsys_bindDescriptorIdentity(__zsys_module_23["GET"]["target"], "browse-path");
__zsys_bindDescriptorIdentity(__zsys_module_24["DELETE"], "route.delete.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_24["DELETE"]["target"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_24["GET"], "route.get.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_24["GET"]["middleware"][0], "order-auth");
__zsys_bindDescriptorIdentity(__zsys_module_24["GET"]["middleware"][0]["target"], "authorize-order");
__zsys_bindDescriptorIdentity(__zsys_module_24["GET"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_24["GET"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_24["HEAD"], "route.head.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_24["HEAD"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_24["HEAD"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_24["OPTIONS"], "route.options.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_24["OPTIONS"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_24["OPTIONS"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_24["PATCH"], "route.patch.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_24["PATCH"]["target"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_24["PUT"], "route.put.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_24["PUT"]["target"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_25["GET"], "route.get.orders");
__zsys_bindDescriptorIdentity(__zsys_module_25["GET"]["rateLimit"]["store"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_25["GET"]["target"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_25["POST"], "route.post.orders");
__zsys_bindDescriptorIdentity(__zsys_module_25["POST"]["target"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_25["POST"]["target"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_25["POST"]["target"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_25["POST"]["target"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_25["POST"]["target"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_26["GET"], "route.get.orders.search");
__zsys_bindDescriptorIdentity(__zsys_module_26["GET"]["target"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_27["POST"], "route.post.uploads");
__zsys_bindDescriptorIdentity(__zsys_module_27["POST"]["target"], "upload-assets");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"], "orders");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["createOrder"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["createOrder"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["createOrder"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["deleteOrder"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["createOrder"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["createOrder"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["createOrder"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["deleteOrder"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["getOrder"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["getOrder"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["searchOrders"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["functions"]["updateOrder"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["getOrder"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["getOrder"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["middleware"][0], "orders.context");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["searchOrders"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_28["default"]["updateOrder"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["default"], "lookup-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["default"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["default"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_30["default"], "orders.normalize-id");

export const manifestContractVersion = 2 as const;
export const manifestGeneratorVersion = 1 as const;
export const manifestGraphHash = "sha256:1b4a1b814d3ddba24f10f1c75eec69154b1cd581ff2192fc1d06ffd949a8288b" as const;
export const providerFactories = { "aws": { recipeTag: "aws", factory: undefined }, "local": { recipeTag: "local", factory: undefined }, "test": { recipeTag: "test", factory: undefined } } as const;
const __zsys_middleware_0 = Object.assign((...args: any[]) => (__zsys_module_11["default"].handler as (...values: any[]) => any)(...args), { targetFunctionId: "authorize-order", request: {"fields":{"authorization":{"kind":"header","name":"authorization"}},"kind":"input"}, decision: {"kind":"continue"} });
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "authorize-order": __zsys_module_11["default"].handler, "browse-path": __zsys_module_12["default"].handler, "orders.create-order": __zsys_module_13["default"].handler, "orders.delete-order": __zsys_module_14["default"].handler, "orders.get-order": __zsys_module_15["default"].handler, "orders.search-orders": __zsys_module_16["default"].handler, "orders.update-order": __zsys_module_17["default"].handler, "send-receipt": __zsys_module_18["default"].handler, "upload-assets": __zsys_module_19["default"].handler, "zsys.agent.order-support.invoke": __zsys_createGeneratedAgentFunction("order-support"), "zsys.event.orders.audit-changes.handler": __zsys_module_4["default"].target.handler, "zsys.event.orders.project-any-change.handler": __zsys_module_7["default"].target.handler, "zsys.event.receipts.on-order-created.handler": __zsys_module_8["default"].target.handler, "zsys.event.telemetry.capture-events.handler": __zsys_module_10["default"].target.handler },
  targets: { "authorize-order": __zsys_module_11["default"], "browse-path": __zsys_module_12["default"], "orders.create-order": __zsys_module_13["default"], "orders.delete-order": __zsys_module_14["default"], "orders.get-order": __zsys_module_15["default"], "orders.search-orders": __zsys_module_16["default"], "orders.update-order": __zsys_module_17["default"], "send-receipt": __zsys_module_18["default"], "upload-assets": __zsys_module_19["default"], "zsys.event.orders.audit-changes.handler": __zsys_createEventListenerTarget(__zsys_module_4["default"], [__zsys_module_5["default"], __zsys_module_6["default"], __zsys_module_9["default"]], "zsys.event.orders.audit-changes.handler"), "zsys.event.orders.project-any-change.handler": __zsys_createEventListenerTarget(__zsys_module_7["default"], [__zsys_module_5["default"], __zsys_module_6["default"], __zsys_module_9["default"]], "zsys.event.orders.project-any-change.handler"), "zsys.event.receipts.on-order-created.handler": __zsys_createEventListenerTarget(__zsys_module_8["default"], [__zsys_module_6["default"]], "zsys.event.receipts.on-order-created.handler"), "zsys.event.telemetry.capture-events.handler": __zsys_createEventListenerTarget(__zsys_module_10["default"], [__zsys_module_5["default"], __zsys_module_6["default"], __zsys_module_9["default"]], "zsys.event.telemetry.capture-events.handler") },
  agents: { "order-support": __zsys_module_0["default"] },
  tools: { "lookup-order": __zsys_module_29["default"] },
  services: { "orders": __zsys_module_28["default"] },
  providers: providerFactories,
  providerFactories,
  middleware: { "order-auth": __zsys_middleware_0 },
  requestTransforms: { "orders.normalize-id": __zsys_module_30["default"].schema },
  application: __zsys_module_1["default"],
} as const;
