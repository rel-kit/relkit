import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/invocation";
import { createGeneratedAgentFunction as __relkit_createGeneratedAgentFunction } from "@relkit/agents";
import { createEventListenerTarget as __relkit_createEventListenerTarget } from "@relkit/events";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/agents/order-support.agent.ts";
import * as __relkit_module_2 from "../../src/buckets/assets.bucket.ts";
import * as __relkit_module_3 from "../../src/cache/prices.cache.ts";
import * as __relkit_module_4 from "../../src/data/application.data-model.ts";
import * as __relkit_module_5 from "../../src/events/order-audit.event.ts";
import * as __relkit_module_6 from "../../src/events/order-cancelled.event.ts";
import * as __relkit_module_7 from "../../src/events/order-created.event.ts";
import * as __relkit_module_8 from "../../src/events/order-projector.event.ts";
import * as __relkit_module_9 from "../../src/events/order-receipt.event.ts";
import * as __relkit_module_10 from "../../src/events/order-updated.event.ts";
import * as __relkit_module_11 from "../../src/events/telemetry.event.ts";
import * as __relkit_module_12 from "../../src/functions/account-session.function.ts";
import * as __relkit_module_13 from "../../src/functions/authorize-order.function.ts";
import * as __relkit_module_14 from "../../src/functions/browse-path.function.ts";
import * as __relkit_module_15 from "../../src/functions/database-users.function.ts";
import * as __relkit_module_16 from "../../src/functions/orders/create-order.function.ts";
import * as __relkit_module_17 from "../../src/functions/orders/delete-order.function.ts";
import * as __relkit_module_18 from "../../src/functions/orders/get-order.function.ts";
import * as __relkit_module_19 from "../../src/functions/orders/search-orders.function.ts";
import * as __relkit_module_20 from "../../src/functions/orders/update-order.function.ts";
import * as __relkit_module_21 from "../../src/functions/send-receipt.function.ts";
import * as __relkit_module_22 from "../../src/functions/upload-assets.function.ts";
import * as __relkit_module_23 from "../../src/jobs/send-receipt.job.ts";
import * as __relkit_module_24 from "../../src/middleware/order-auth.middleware.ts";
import * as __relkit_module_25 from "../../src/routes/account/profile/route.ts";
import * as __relkit_module_26 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __relkit_module_27 from "../../src/routes/database/users/route.ts";
import * as __relkit_module_28 from "../../src/routes/docs/[[...parts]]/route.ts";
import * as __relkit_module_29 from "../../src/routes/files/[...parts]/route.ts";
import * as __relkit_module_30 from "../../src/routes/orders/[orderId]/route.ts";
import * as __relkit_module_31 from "../../src/routes/orders/route.ts";
import * as __relkit_module_32 from "../../src/routes/orders/search/route.ts";
import * as __relkit_module_33 from "../../src/routes/uploads/route.ts";
import * as __relkit_module_34 from "../../src/services/orders.service.ts";
import * as __relkit_module_35 from "../../src/tools/cancel-order.tool.ts";
import * as __relkit_module_36 from "../../src/tools/lookup-order.tool.ts";
import * as __relkit_module_37 from "../../src/transforms/orders/normalize-id.transform.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "commerce-api");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "order-support");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_3["default"], "prices");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"], "application");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"], "orders.audit-changes");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"]["target"], "relkit.event.orders.audit-changes.handler");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"], "orders.cancelled");
__relkit_bindDescriptorIdentity(__relkit_module_7["default"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_8["default"], "orders.project-any-change");
__relkit_bindDescriptorIdentity(__relkit_module_8["default"]["target"], "relkit.event.orders.project-any-change.handler");
__relkit_bindDescriptorIdentity(__relkit_module_9["default"], "receipts.on-order-created");
__relkit_bindDescriptorIdentity(__relkit_module_9["default"]["target"], "relkit.event.receipts.on-order-created.handler");
__relkit_bindDescriptorIdentity(__relkit_module_9["default"]["target"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_9["default"]["target"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_10["default"], "orders.updated");
__relkit_bindDescriptorIdentity(__relkit_module_11["default"], "telemetry.capture-events");
__relkit_bindDescriptorIdentity(__relkit_module_11["default"]["target"], "relkit.event.telemetry.capture-events.handler");
__relkit_bindDescriptorIdentity(__relkit_module_12["default"], "account-session");
__relkit_bindDescriptorIdentity(__relkit_module_13["default"], "authorize-order");
__relkit_bindDescriptorIdentity(__relkit_module_14["default"], "browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_15["default"], "database-users");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"]["dependencies"]["cache"]["prices"], "prices");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"]["dependencies"]["events"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"]["dependencies"]["jobs"]["sendReceiptJob"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_17["default"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_18["default"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_18["default"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_21["default"], "send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_21["default"]["dependencies"]["buckets"]["assets"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_22["default"], "upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_22["default"]["dependencies"]["buckets"]["assets"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["target"], "send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_24["default"], "order-auth");
__relkit_bindDescriptorIdentity(__relkit_module_25["GET"], "route.get.account.profile");
__relkit_bindDescriptorIdentity(__relkit_module_25["GET"]["target"], "account-session");
__relkit_bindDescriptorIdentity(__relkit_module_26["ALL"], "route.all.api.auth.optional-catch-all-auth");
__relkit_bindDescriptorIdentity(__relkit_module_27["GET"], "route.get.database.users");
__relkit_bindDescriptorIdentity(__relkit_module_27["GET"]["target"], "database-users");
__relkit_bindDescriptorIdentity(__relkit_module_28["GET"], "route.get.docs.optional-catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_28["GET"]["target"], "browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_29["GET"], "route.get.files.catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_29["GET"]["target"], "browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_30["DELETE"], "route.delete.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_30["DELETE"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_30["GET"], "route.get.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_30["GET"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_30["GET"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_30["HEAD"], "route.head.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_30["HEAD"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_30["HEAD"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_30["OPTIONS"], "route.options.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_30["OPTIONS"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_30["OPTIONS"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_30["PATCH"], "route.patch.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_30["PATCH"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_30["PUT"], "route.put.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_30["PUT"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_31["GET"], "route.get.orders");
__relkit_bindDescriptorIdentity(__relkit_module_31["GET"]["rateLimit"]["store"], "prices");
__relkit_bindDescriptorIdentity(__relkit_module_31["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_31["POST"], "route.post.orders");
__relkit_bindDescriptorIdentity(__relkit_module_31["POST"]["target"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_31["POST"]["target"]["dependencies"]["cache"]["prices"], "prices");
__relkit_bindDescriptorIdentity(__relkit_module_31["POST"]["target"]["dependencies"]["events"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_31["POST"]["target"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_31["POST"]["target"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_32["GET"], "route.get.orders.search");
__relkit_bindDescriptorIdentity(__relkit_module_32["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_33["POST"], "route.post.uploads");
__relkit_bindDescriptorIdentity(__relkit_module_33["POST"]["target"], "upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_33["POST"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"], "orders");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["createOrder"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["createOrder"]["dependencies"]["cache"]["prices"], "prices");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["createOrder"]["dependencies"]["events"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["deleteOrder"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["createOrder"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["createOrder"]["dependencies"]["cache"]["prices"], "prices");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["createOrder"]["dependencies"]["events"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["deleteOrder"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["getOrder"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["getOrder"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["searchOrders"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["functions"]["updateOrder"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["getOrder"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["getOrder"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["middleware"][0], "orders.context");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["searchOrders"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"]["updateOrder"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_35["default"], "cancel-order");
__relkit_bindDescriptorIdentity(__relkit_module_35["default"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["default"], "lookup-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["default"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["default"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_37["default"], "orders.normalize-id");

export const manifestContractVersion = 5 as const;
export const manifestGeneratorVersion = 2 as const;
export const manifestGraphHash = "sha256:14ce6bfa036269949cc13a22619f794d0d3dd896d1d726435100cd84a6089719" as const;
export const providerFactories = { "buckets:s3": { capability: "buckets", adapter: "s3", factory: undefined }, "cache:redis": { capability: "cache", adapter: "redis", factory: undefined }, "events:eventbridge": { capability: "events", adapter: "eventbridge", factory: undefined }, "jobs:sqs": { capability: "jobs", adapter: "sqs", factory: undefined }, "models:ai-sdk": { capability: "models", adapter: "ai-sdk", factory: undefined }, "observability:cloudwatch": { capability: "observability", adapter: "cloudwatch", factory: undefined } } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "account-session": __relkit_module_12["default"].handler, "authorize-order": __relkit_module_13["default"].handler, "browse-path": __relkit_module_14["default"].handler, "database-users": __relkit_module_15["default"].handler, "orders.create-order": __relkit_module_16["default"].handler, "orders.delete-order": __relkit_module_17["default"].handler, "orders.get-order": __relkit_module_18["default"].handler, "orders.search-orders": __relkit_module_19["default"].handler, "orders.update-order": __relkit_module_20["default"].handler, "relkit.agent.order-support.invoke": __relkit_createGeneratedAgentFunction("order-support"), "relkit.event.orders.audit-changes.handler": __relkit_module_5["default"].target.handler, "relkit.event.orders.project-any-change.handler": __relkit_module_8["default"].target.handler, "relkit.event.receipts.on-order-created.handler": __relkit_module_9["default"].target.handler, "relkit.event.telemetry.capture-events.handler": __relkit_module_11["default"].target.handler, "send-receipt": __relkit_module_21["default"].handler, "upload-assets": __relkit_module_22["default"].handler },
  targets: { "account-session": __relkit_module_12["default"], "authorize-order": __relkit_module_13["default"], "browse-path": __relkit_module_14["default"], "database-users": __relkit_module_15["default"], "orders.create-order": __relkit_module_16["default"], "orders.delete-order": __relkit_module_17["default"], "orders.get-order": __relkit_module_18["default"], "orders.search-orders": __relkit_module_19["default"], "orders.update-order": __relkit_module_20["default"], "relkit.event.orders.audit-changes.handler": __relkit_createEventListenerTarget(__relkit_module_5["default"], [__relkit_module_6["default"], __relkit_module_7["default"], __relkit_module_10["default"]], "relkit.event.orders.audit-changes.handler"), "relkit.event.orders.project-any-change.handler": __relkit_createEventListenerTarget(__relkit_module_8["default"], [__relkit_module_6["default"], __relkit_module_7["default"], __relkit_module_10["default"]], "relkit.event.orders.project-any-change.handler"), "relkit.event.receipts.on-order-created.handler": __relkit_createEventListenerTarget(__relkit_module_9["default"], [__relkit_module_7["default"]], "relkit.event.receipts.on-order-created.handler"), "relkit.event.telemetry.capture-events.handler": __relkit_createEventListenerTarget(__relkit_module_11["default"], [__relkit_module_6["default"], __relkit_module_7["default"], __relkit_module_10["default"]], "relkit.event.telemetry.capture-events.handler"), "send-receipt": __relkit_module_21["default"], "upload-assets": __relkit_module_22["default"] },
  agents: { "order-support": __relkit_module_1["default"] },
  tools: { "cancel-order": __relkit_module_35["default"], "lookup-order": __relkit_module_36["default"] },
  routes: { "route.all.api.auth.optional-catch-all-auth": __relkit_module_26["ALL"], "route.delete.orders.by-order-id": __relkit_module_30["DELETE"], "route.get.account.profile": __relkit_module_25["GET"], "route.get.database.users": __relkit_module_27["GET"], "route.get.docs.optional-catch-all-parts": __relkit_module_28["GET"], "route.get.files.catch-all-parts": __relkit_module_29["GET"], "route.get.orders": __relkit_module_31["GET"], "route.get.orders.by-order-id": __relkit_module_30["GET"], "route.get.orders.search": __relkit_module_32["GET"], "route.head.orders.by-order-id": __relkit_module_30["HEAD"], "route.options.orders.by-order-id": __relkit_module_30["OPTIONS"], "route.patch.orders.by-order-id": __relkit_module_30["PATCH"], "route.post.orders": __relkit_module_31["POST"], "route.post.uploads": __relkit_module_33["POST"], "route.put.orders.by-order-id": __relkit_module_30["PUT"] },
  constants: {  },
  prompts: {  },
  dataModel: __relkit_module_4["default"],
  services: { "orders": __relkit_module_34["default"] },
  providers: providerFactories,
  providerFactories,
  middleware: { "order-auth": __relkit_module_24["default"] },
  hooks: {  },
  requestTransforms: { "orders.normalize-id": __relkit_module_37["default"].schema },
  application: __relkit_module_0["default"],
} as const;
