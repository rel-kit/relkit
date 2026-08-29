import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/invocation";
import { createGeneratedAgentFunction as __relkit_createGeneratedAgentFunction } from "@relkit/agents";
import { createEventListenerTarget as __relkit_createEventListenerTarget } from "@relkit/events";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/account/functions/account-session.function.ts";
import * as __relkit_module_2 from "../../src/account/service.ts";
import * as __relkit_module_3 from "../../src/assets/buckets/assets.bucket.ts";
import * as __relkit_module_4 from "../../src/assets/functions/upload-assets.function.ts";
import * as __relkit_module_5 from "../../src/assets/service.ts";
import * as __relkit_module_6 from "../../src/auth/service.ts";
import * as __relkit_module_7 from "../../src/database/service.ts";
import * as __relkit_module_8 from "../../src/navigation/functions/browse-path.function.ts";
import * as __relkit_module_9 from "../../src/navigation/service.ts";
import * as __relkit_module_10 from "../../src/orders/agents/order-support.agent.ts";
import * as __relkit_module_11 from "../../src/orders/cache/prices.cache.ts";
import * as __relkit_module_12 from "../../src/orders/events/order-audit.event.ts";
import * as __relkit_module_13 from "../../src/orders/events/order-cancelled.event.ts";
import * as __relkit_module_14 from "../../src/orders/events/order-created.event.ts";
import * as __relkit_module_15 from "../../src/orders/events/order-projector.event.ts";
import * as __relkit_module_16 from "../../src/orders/events/order-updated.event.ts";
import * as __relkit_module_17 from "../../src/orders/functions/authorize-order.function.ts";
import * as __relkit_module_18 from "../../src/orders/functions/create-order.function.ts";
import * as __relkit_module_19 from "../../src/orders/functions/delete-order.function.ts";
import * as __relkit_module_20 from "../../src/orders/functions/get-order.function.ts";
import * as __relkit_module_21 from "../../src/orders/functions/search-orders.function.ts";
import * as __relkit_module_22 from "../../src/orders/functions/update-order.function.ts";
import * as __relkit_module_23 from "../../src/orders/service.ts";
import * as __relkit_module_24 from "../../src/orders/tools/cancel-order.tool.ts";
import * as __relkit_module_25 from "../../src/orders/tools/lookup-order.tool.ts";
import * as __relkit_module_26 from "../../src/receipts/events/order-receipt.event.ts";
import * as __relkit_module_27 from "../../src/receipts/functions/send-receipt.function.ts";
import * as __relkit_module_28 from "../../src/receipts/jobs/send-receipt.job.ts";
import * as __relkit_module_29 from "../../src/receipts/service.ts";
import * as __relkit_module_30 from "../../src/routes/account/profile/route.ts";
import * as __relkit_module_31 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __relkit_module_32 from "../../src/routes/database/users/route.ts";
import * as __relkit_module_33 from "../../src/routes/docs/[[...parts]]/route.ts";
import * as __relkit_module_34 from "../../src/routes/files/[...parts]/route.ts";
import * as __relkit_module_35 from "../../src/routes/middleware/order-auth.middleware.ts";
import * as __relkit_module_36 from "../../src/routes/orders/[orderId]/route.ts";
import * as __relkit_module_37 from "../../src/routes/orders/route.ts";
import * as __relkit_module_38 from "../../src/routes/orders/search/route.ts";
import * as __relkit_module_39 from "../../src/routes/transforms/orders/normalize-id.transform.ts";
import * as __relkit_module_40 from "../../src/routes/uploads/route.ts";
import * as __relkit_module_41 from "../../src/telemetry/events/telemetry.event.ts";
import * as __relkit_module_42 from "../../src/telemetry/service.ts";
import * as __relkit_module_43 from "../../src/users/functions/database-users.function.ts";
import * as __relkit_module_44 from "../../src/users/service.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "commerce-api");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "account.account-session");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"], "account");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"]["accountSession"], "account.account-session");
__relkit_bindDescriptorIdentity(__relkit_module_3["default"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"], "assets.upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"]["uploadAssets"], "assets.upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"]["uploadAssets"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"], "auth");
__relkit_bindDescriptorIdentity(__relkit_module_7["default"], "database");
__relkit_bindDescriptorIdentity(__relkit_module_8["default"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_9["default"], "navigation");
__relkit_bindDescriptorIdentity(__relkit_module_9["default"]["browsePath"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_10["default"], "orders.order-support");
__relkit_bindDescriptorIdentity(__relkit_module_11["default"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_12["default"], "orders.audit-changes");
__relkit_bindDescriptorIdentity(__relkit_module_12["default"]["target"], "relkit.event.orders.audit-changes.handler");
__relkit_bindDescriptorIdentity(__relkit_module_13["default"], "orders.cancelled");
__relkit_bindDescriptorIdentity(__relkit_module_14["default"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_15["default"], "orders.project-any-change");
__relkit_bindDescriptorIdentity(__relkit_module_15["default"]["target"], "relkit.event.orders.project-any-change.handler");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"], "orders.updated");
__relkit_bindDescriptorIdentity(__relkit_module_17["default"], "orders.authorize-order");
__relkit_bindDescriptorIdentity(__relkit_module_18["default"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_18["default"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_18["default"]["dependencies"]["events"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_21["default"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_22["default"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"], "orders");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["authorizeOrder"], "orders.authorize-order");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["createOrder"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["createOrder"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["createOrder"]["dependencies"]["events"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["deleteOrder"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["getOrder"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["getOrder"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["orderCancelled"], "orders.cancelled");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["orderUpdated"], "orders.updated");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["searchOrders"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["updateOrder"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_24["default"], "orders.cancel-order");
__relkit_bindDescriptorIdentity(__relkit_module_24["default"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_25["default"], "orders.lookup-order");
__relkit_bindDescriptorIdentity(__relkit_module_25["default"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_25["default"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_26["default"], "receipts.on-order-created");
__relkit_bindDescriptorIdentity(__relkit_module_26["default"]["target"], "relkit.event.receipts.on-order-created.handler");
__relkit_bindDescriptorIdentity(__relkit_module_26["default"]["target"]["dependencies"]["jobs"]["sendReceiptJob"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_26["default"]["target"]["dependencies"]["jobs"]["sendReceiptJob"]["target"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_27["default"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_27["default"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_28["default"], "receipts.send-job");
__relkit_bindDescriptorIdentity(__relkit_module_28["default"]["target"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_28["default"]["target"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_29["default"], "receipts");
__relkit_bindDescriptorIdentity(__relkit_module_29["default"]["sendReceipt"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_29["default"]["sendReceipt"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_30["GET"], "route.get.account.profile");
__relkit_bindDescriptorIdentity(__relkit_module_30["GET"]["target"], "account.account-session");
__relkit_bindDescriptorIdentity(__relkit_module_31["ALL"], "route.all.api.auth.optional-catch-all-auth");
__relkit_bindDescriptorIdentity(__relkit_module_32["GET"], "route.get.database.users");
__relkit_bindDescriptorIdentity(__relkit_module_32["GET"]["target"], "users.database-users");
__relkit_bindDescriptorIdentity(__relkit_module_33["GET"], "route.get.docs.optional-catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_33["GET"]["target"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_34["GET"], "route.get.files.catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_34["GET"]["target"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_35["default"], "order-auth");
__relkit_bindDescriptorIdentity(__relkit_module_36["DELETE"], "route.delete.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_36["DELETE"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["GET"], "route.get.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_36["GET"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["GET"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_36["HEAD"], "route.head.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_36["HEAD"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["HEAD"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_36["OPTIONS"], "route.options.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_36["OPTIONS"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["OPTIONS"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_36["PATCH"], "route.patch.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_36["PATCH"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_36["PUT"], "route.put.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_36["PUT"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_37["GET"], "route.get.orders");
__relkit_bindDescriptorIdentity(__relkit_module_37["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_37["POST"], "route.post.orders");
__relkit_bindDescriptorIdentity(__relkit_module_37["POST"]["target"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_37["POST"]["target"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_37["POST"]["target"]["dependencies"]["events"]["orderCreated"], "orders.created");
__relkit_bindDescriptorIdentity(__relkit_module_38["GET"], "route.get.orders.search");
__relkit_bindDescriptorIdentity(__relkit_module_38["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_39["default"], "orders.normalize-id");
__relkit_bindDescriptorIdentity(__relkit_module_40["POST"], "route.post.uploads");
__relkit_bindDescriptorIdentity(__relkit_module_40["POST"]["target"], "assets.upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_40["POST"]["target"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_41["default"], "telemetry.capture-events");
__relkit_bindDescriptorIdentity(__relkit_module_41["default"]["target"], "relkit.event.telemetry.capture-events.handler");
__relkit_bindDescriptorIdentity(__relkit_module_42["default"], "telemetry");
__relkit_bindDescriptorIdentity(__relkit_module_43["default"], "users.database-users");
__relkit_bindDescriptorIdentity(__relkit_module_44["default"], "users");
__relkit_bindDescriptorIdentity(__relkit_module_44["default"]["databaseUsers"], "users.database-users");

export const manifestContractVersion = 6 as const;
export const manifestGeneratorVersion = 3 as const;
export const manifestGraphHash = "sha256:5a941bc62d8bdd7062ffc7b472f701cddf227bee458691f7776eff20aa687daf" as const;
export const providerFactories = { "buckets:s3": { capability: "buckets", adapter: "s3", factory: undefined }, "cache:redis": { capability: "cache", adapter: "redis", factory: undefined }, "events:eventbridge": { capability: "events", adapter: "eventbridge", factory: undefined }, "jobs:sqs": { capability: "jobs", adapter: "sqs", factory: undefined }, "models:ai-sdk": { capability: "models", adapter: "ai-sdk", factory: undefined }, "observability:cloudwatch": { capability: "observability", adapter: "cloudwatch", factory: undefined } } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "account.account-session": __relkit_module_1["default"].handler, "assets.upload-assets": __relkit_module_4["default"].handler, "navigation.browse-path": __relkit_module_8["default"].handler, "orders.authorize-order": __relkit_module_17["default"].handler, "orders.create-order": __relkit_module_18["default"].handler, "orders.delete-order": __relkit_module_19["default"].handler, "orders.get-order": __relkit_module_20["default"].handler, "orders.search-orders": __relkit_module_21["default"].handler, "orders.update-order": __relkit_module_22["default"].handler, "receipts.send-receipt": __relkit_module_27["default"].handler, "relkit.agent.orders.order-support.invoke": __relkit_createGeneratedAgentFunction("orders.order-support"), "relkit.event.orders.audit-changes.handler": __relkit_module_12["default"].target.handler, "relkit.event.orders.project-any-change.handler": __relkit_module_15["default"].target.handler, "relkit.event.receipts.on-order-created.handler": __relkit_module_26["default"].target.handler, "relkit.event.telemetry.capture-events.handler": __relkit_module_41["default"].target.handler, "users.database-users": __relkit_module_43["default"].handler },
  targets: { "account.account-session": __relkit_module_1["default"], "assets.upload-assets": __relkit_module_4["default"], "navigation.browse-path": __relkit_module_8["default"], "orders.authorize-order": __relkit_module_17["default"], "orders.create-order": __relkit_module_18["default"], "orders.delete-order": __relkit_module_19["default"], "orders.get-order": __relkit_module_20["default"], "orders.search-orders": __relkit_module_21["default"], "orders.update-order": __relkit_module_22["default"], "receipts.send-receipt": __relkit_module_27["default"], "relkit.event.orders.audit-changes.handler": __relkit_createEventListenerTarget(__relkit_module_12["default"], [__relkit_module_13["default"], __relkit_module_14["default"], __relkit_module_16["default"]], "relkit.event.orders.audit-changes.handler"), "relkit.event.orders.project-any-change.handler": __relkit_createEventListenerTarget(__relkit_module_15["default"], [__relkit_module_13["default"], __relkit_module_14["default"], __relkit_module_16["default"]], "relkit.event.orders.project-any-change.handler"), "relkit.event.receipts.on-order-created.handler": __relkit_createEventListenerTarget(__relkit_module_26["default"], [__relkit_module_14["default"]], "relkit.event.receipts.on-order-created.handler"), "relkit.event.telemetry.capture-events.handler": __relkit_createEventListenerTarget(__relkit_module_41["default"], [__relkit_module_13["default"], __relkit_module_14["default"], __relkit_module_16["default"]], "relkit.event.telemetry.capture-events.handler"), "users.database-users": __relkit_module_43["default"] },
  agents: { "orders.order-support": __relkit_module_10["default"] },
  tools: { "orders.cancel-order": __relkit_module_24["default"], "orders.lookup-order": __relkit_module_25["default"] },
  routes: { "route.all.api.auth.optional-catch-all-auth": __relkit_module_31["ALL"], "route.delete.orders.by-order-id": __relkit_module_36["DELETE"], "route.get.account.profile": __relkit_module_30["GET"], "route.get.database.users": __relkit_module_32["GET"], "route.get.docs.optional-catch-all-parts": __relkit_module_33["GET"], "route.get.files.catch-all-parts": __relkit_module_34["GET"], "route.get.orders": __relkit_module_37["GET"], "route.get.orders.by-order-id": __relkit_module_36["GET"], "route.get.orders.search": __relkit_module_38["GET"], "route.head.orders.by-order-id": __relkit_module_36["HEAD"], "route.options.orders.by-order-id": __relkit_module_36["OPTIONS"], "route.patch.orders.by-order-id": __relkit_module_36["PATCH"], "route.post.orders": __relkit_module_37["POST"], "route.post.uploads": __relkit_module_40["POST"], "route.put.orders.by-order-id": __relkit_module_36["PUT"] },
  constants: {  },
  prompts: {  },
  services: { "account": __relkit_module_2["default"], "assets": __relkit_module_5["default"], "auth": __relkit_module_6["default"], "database": __relkit_module_7["default"], "navigation": __relkit_module_9["default"], "orders": __relkit_module_23["default"], "receipts": __relkit_module_29["default"], "telemetry": __relkit_module_42["default"], "users": __relkit_module_44["default"] },
  providers: providerFactories,
  providerFactories,
  middleware: { "order-auth": __relkit_module_35["default"] },
  hooks: {  },
  requestTransforms: { "orders.normalize-id": __relkit_module_39["default"].schema },
  application: __relkit_module_0["default"],
} as const;
