import { bindDescriptorIdentity as __zsys_bindDescriptorIdentity } from "@zsys/invocation";
import { createGeneratedAgentFunction as __zsys_createGeneratedAgentFunction } from "@zsys/agents";
import { createEventListenerTarget as __zsys_createEventListenerTarget } from "@zsys/events";
import * as __zsys_module_0 from "../../src/agents/order-support.agent.ts";
import * as __zsys_module_1 from "../../src/buckets/assets.bucket.ts";
import * as __zsys_module_2 from "../../src/cache/prices.cache.ts";
import * as __zsys_module_3 from "../../src/data/application.data-model.ts";
import * as __zsys_module_4 from "../../src/events/order-audit.event.ts";
import * as __zsys_module_5 from "../../src/events/order-cancelled.event.ts";
import * as __zsys_module_6 from "../../src/events/order-created.event.ts";
import * as __zsys_module_7 from "../../src/events/order-projector.event.ts";
import * as __zsys_module_8 from "../../src/events/order-receipt.event.ts";
import * as __zsys_module_9 from "../../src/events/order-updated.event.ts";
import * as __zsys_module_10 from "../../src/events/telemetry.event.ts";
import * as __zsys_module_11 from "../../src/functions/account-session.function.ts";
import * as __zsys_module_12 from "../../src/functions/authorize-order.function.ts";
import * as __zsys_module_13 from "../../src/functions/browse-path.function.ts";
import * as __zsys_module_14 from "../../src/functions/database-users.function.ts";
import * as __zsys_module_15 from "../../src/functions/orders/create-order.function.ts";
import * as __zsys_module_16 from "../../src/functions/orders/delete-order.function.ts";
import * as __zsys_module_17 from "../../src/functions/orders/get-order.function.ts";
import * as __zsys_module_18 from "../../src/functions/orders/search-orders.function.ts";
import * as __zsys_module_19 from "../../src/functions/orders/update-order.function.ts";
import * as __zsys_module_20 from "../../src/functions/send-receipt.function.ts";
import * as __zsys_module_21 from "../../src/functions/upload-assets.function.ts";
import * as __zsys_module_22 from "../../src/jobs/send-receipt.job.ts";
import * as __zsys_module_23 from "../../src/middleware/order-auth.middleware.ts";
import * as __zsys_module_24 from "../../src/routes/account/profile/route.ts";
import * as __zsys_module_25 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __zsys_module_26 from "../../src/routes/database/users/route.ts";
import * as __zsys_module_27 from "../../src/routes/docs/[[...parts]]/route.ts";
import * as __zsys_module_28 from "../../src/routes/files/[...parts]/route.ts";
import * as __zsys_module_29 from "../../src/routes/orders/[orderId]/route.ts";
import * as __zsys_module_30 from "../../src/routes/orders/route.ts";
import * as __zsys_module_31 from "../../src/routes/orders/search/route.ts";
import * as __zsys_module_32 from "../../src/routes/uploads/route.ts";
import * as __zsys_module_33 from "../../src/services/orders.service.ts";
import * as __zsys_module_34 from "../../src/tools/lookup-order.tool.ts";
import * as __zsys_module_35 from "../../src/transforms/orders/normalize-id.transform.ts";
import * as __zsys_module_36 from "../../zsys.config.ts";

__zsys_bindDescriptorIdentity(__zsys_module_0["default"], "order-support");
__zsys_bindDescriptorIdentity(__zsys_module_1["default"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_2["default"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_3["default"], "application");
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
__zsys_bindDescriptorIdentity(__zsys_module_11["default"], "account-session");
__zsys_bindDescriptorIdentity(__zsys_module_12["default"], "authorize-order");
__zsys_bindDescriptorIdentity(__zsys_module_13["default"], "browse-path");
__zsys_bindDescriptorIdentity(__zsys_module_14["default"], "database-users");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_15["default"]["dependencies"]["jobs"]["sendReceiptJob"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_16["default"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_17["default"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_17["default"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_18["default"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_19["default"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_20["default"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_20["default"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_21["default"], "upload-assets");
__zsys_bindDescriptorIdentity(__zsys_module_21["default"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_22["default"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_22["default"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_22["default"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_23["default"], "order-auth");
__zsys_bindDescriptorIdentity(__zsys_module_24["GET"], "route.get.account.profile");
__zsys_bindDescriptorIdentity(__zsys_module_24["GET"]["target"], "account-session");
__zsys_bindDescriptorIdentity(__zsys_module_25["ALL"], "route.all.api.auth.optional-catch-all-auth");
__zsys_bindDescriptorIdentity(__zsys_module_26["GET"], "route.get.database.users");
__zsys_bindDescriptorIdentity(__zsys_module_26["GET"]["target"], "database-users");
__zsys_bindDescriptorIdentity(__zsys_module_27["GET"], "route.get.docs.optional-catch-all-parts");
__zsys_bindDescriptorIdentity(__zsys_module_27["GET"]["target"], "browse-path");
__zsys_bindDescriptorIdentity(__zsys_module_28["GET"], "route.get.files.catch-all-parts");
__zsys_bindDescriptorIdentity(__zsys_module_28["GET"]["target"], "browse-path");
__zsys_bindDescriptorIdentity(__zsys_module_29["DELETE"], "route.delete.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_29["DELETE"]["target"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["GET"], "route.get.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_29["GET"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["GET"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_29["HEAD"], "route.head.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_29["HEAD"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["HEAD"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_29["OPTIONS"], "route.options.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_29["OPTIONS"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["OPTIONS"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_29["PATCH"], "route.patch.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_29["PATCH"]["target"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_29["PUT"], "route.put.orders.by-order-id");
__zsys_bindDescriptorIdentity(__zsys_module_29["PUT"]["target"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_30["GET"], "route.get.orders");
__zsys_bindDescriptorIdentity(__zsys_module_30["GET"]["rateLimit"]["store"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_30["GET"]["target"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_30["POST"], "route.post.orders");
__zsys_bindDescriptorIdentity(__zsys_module_30["POST"]["target"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_30["POST"]["target"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_30["POST"]["target"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_30["POST"]["target"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_30["POST"]["target"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_31["GET"], "route.get.orders.search");
__zsys_bindDescriptorIdentity(__zsys_module_31["GET"]["target"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_32["POST"], "route.post.uploads");
__zsys_bindDescriptorIdentity(__zsys_module_32["POST"]["target"], "upload-assets");
__zsys_bindDescriptorIdentity(__zsys_module_32["POST"]["target"]["dependencies"]["buckets"]["assets"], "assets");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"], "orders");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["createOrder"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["createOrder"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["createOrder"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["deleteOrder"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["createOrder"], "orders.create-order");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["createOrder"]["dependencies"]["cache"]["prices"], "prices");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["createOrder"]["dependencies"]["events"]["orderCreated"], "orders.created");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["createOrder"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "send-receipt");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["deleteOrder"], "orders.delete-order");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["getOrder"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["getOrder"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["searchOrders"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["functions"]["updateOrder"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["getOrder"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["getOrder"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["middleware"][0], "orders.context");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["searchOrders"], "orders.search-orders");
__zsys_bindDescriptorIdentity(__zsys_module_33["default"]["updateOrder"], "orders.update-order");
__zsys_bindDescriptorIdentity(__zsys_module_34["default"], "lookup-order");
__zsys_bindDescriptorIdentity(__zsys_module_34["default"]["target"], "orders.get-order");
__zsys_bindDescriptorIdentity(__zsys_module_34["default"]["target"]["errors"][0], "orders.not-found");
__zsys_bindDescriptorIdentity(__zsys_module_35["default"], "orders.normalize-id");
__zsys_bindDescriptorIdentity(__zsys_module_36["default"], "commerce-api");

export const manifestContractVersion = 5 as const;
export const manifestGeneratorVersion = 2 as const;
export const manifestGraphHash = "sha256:1bd9ae3499de8de89747df12ec929c4e7dda767cef3706c819fcb7b1a5f2f15f" as const;
export const providerFactories = { "buckets:s3": { capability: "buckets", adapter: "s3", factory: undefined }, "cache:redis": { capability: "cache", adapter: "redis", factory: undefined }, "events:eventbridge": { capability: "events", adapter: "eventbridge", factory: undefined }, "jobs:sqs": { capability: "jobs", adapter: "sqs", factory: undefined }, "models:ai-sdk": { capability: "models", adapter: "ai-sdk", factory: undefined }, "observability:cloudwatch": { capability: "observability", adapter: "cloudwatch", factory: undefined } } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "account-session": __zsys_module_11["default"].handler, "authorize-order": __zsys_module_12["default"].handler, "browse-path": __zsys_module_13["default"].handler, "database-users": __zsys_module_14["default"].handler, "orders.create-order": __zsys_module_15["default"].handler, "orders.delete-order": __zsys_module_16["default"].handler, "orders.get-order": __zsys_module_17["default"].handler, "orders.search-orders": __zsys_module_18["default"].handler, "orders.update-order": __zsys_module_19["default"].handler, "send-receipt": __zsys_module_20["default"].handler, "upload-assets": __zsys_module_21["default"].handler, "zsys.agent.order-support.invoke": __zsys_createGeneratedAgentFunction("order-support"), "zsys.event.orders.audit-changes.handler": __zsys_module_4["default"].target.handler, "zsys.event.orders.project-any-change.handler": __zsys_module_7["default"].target.handler, "zsys.event.receipts.on-order-created.handler": __zsys_module_8["default"].target.handler, "zsys.event.telemetry.capture-events.handler": __zsys_module_10["default"].target.handler },
  targets: { "account-session": __zsys_module_11["default"], "authorize-order": __zsys_module_12["default"], "browse-path": __zsys_module_13["default"], "database-users": __zsys_module_14["default"], "orders.create-order": __zsys_module_15["default"], "orders.delete-order": __zsys_module_16["default"], "orders.get-order": __zsys_module_17["default"], "orders.search-orders": __zsys_module_18["default"], "orders.update-order": __zsys_module_19["default"], "send-receipt": __zsys_module_20["default"], "upload-assets": __zsys_module_21["default"], "zsys.event.orders.audit-changes.handler": __zsys_createEventListenerTarget(__zsys_module_4["default"], [__zsys_module_5["default"], __zsys_module_6["default"], __zsys_module_9["default"]], "zsys.event.orders.audit-changes.handler"), "zsys.event.orders.project-any-change.handler": __zsys_createEventListenerTarget(__zsys_module_7["default"], [__zsys_module_5["default"], __zsys_module_6["default"], __zsys_module_9["default"]], "zsys.event.orders.project-any-change.handler"), "zsys.event.receipts.on-order-created.handler": __zsys_createEventListenerTarget(__zsys_module_8["default"], [__zsys_module_6["default"]], "zsys.event.receipts.on-order-created.handler"), "zsys.event.telemetry.capture-events.handler": __zsys_createEventListenerTarget(__zsys_module_10["default"], [__zsys_module_5["default"], __zsys_module_6["default"], __zsys_module_9["default"]], "zsys.event.telemetry.capture-events.handler") },
  agents: { "order-support": __zsys_module_0["default"] },
  tools: { "lookup-order": __zsys_module_34["default"] },
  routes: { "route.all.api.auth.optional-catch-all-auth": __zsys_module_25["ALL"], "route.delete.orders.by-order-id": __zsys_module_29["DELETE"], "route.get.account.profile": __zsys_module_24["GET"], "route.get.database.users": __zsys_module_26["GET"], "route.get.docs.optional-catch-all-parts": __zsys_module_27["GET"], "route.get.files.catch-all-parts": __zsys_module_28["GET"], "route.get.orders": __zsys_module_30["GET"], "route.get.orders.by-order-id": __zsys_module_29["GET"], "route.get.orders.search": __zsys_module_31["GET"], "route.head.orders.by-order-id": __zsys_module_29["HEAD"], "route.options.orders.by-order-id": __zsys_module_29["OPTIONS"], "route.patch.orders.by-order-id": __zsys_module_29["PATCH"], "route.post.orders": __zsys_module_30["POST"], "route.post.uploads": __zsys_module_32["POST"], "route.put.orders.by-order-id": __zsys_module_29["PUT"] },
  constants: {  },
  prompts: {  },
  dataModel: __zsys_module_3["default"],
  services: { "orders": __zsys_module_33["default"] },
  providers: providerFactories,
  providerFactories,
  middleware: { "order-auth": __zsys_module_23["default"] },
  hooks: {  },
  requestTransforms: { "orders.normalize-id": __zsys_module_35["default"].schema },
  application: __zsys_module_36["default"],
} as const;
