import runtimeActivationFingerprint from "./runtime-activation.json" with { type: "json" };
import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/app/internal/runtime";
import { createGeneratedAgentFunction as __relkit_createGeneratedAgentFunction } from "@relkit/app/agents";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/routes/account/profile/route.ts";
import * as __relkit_module_2 from "../../src/routes/announcements/route.ts";
import * as __relkit_module_3 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __relkit_module_4 from "../../src/routes/database/users/route.ts";
import * as __relkit_module_5 from "../../src/routes/docs/[[...parts]]/route.ts";
import * as __relkit_module_6 from "../../src/routes/files/[...parts]/route.ts";
import * as __relkit_module_7 from "../../src/routes/middleware/order-auth.middleware.ts";
import * as __relkit_module_8 from "../../src/routes/orders/[orderId]/route.ts";
import * as __relkit_module_9 from "../../src/routes/orders/export/route.ts";
import * as __relkit_module_10 from "../../src/routes/orders/route.ts";
import * as __relkit_module_11 from "../../src/routes/orders/search/route.ts";
import * as __relkit_module_12 from "../../src/routes/reports/[reportId]/route.ts";
import * as __relkit_module_13 from "../../src/routes/transforms/orders/normalize-id.transform.ts";
import * as __relkit_module_14 from "../../src/routes/uploads/route.ts";
import * as __relkit_module_15 from "../../src/services/account/functions/account-session.function.ts";
import * as __relkit_module_16 from "../../src/services/account/service.ts";
import * as __relkit_module_17 from "../../src/services/announcements/channels/announcements.channel.ts";
import * as __relkit_module_18 from "../../src/services/announcements/functions/get-announcements.function.ts";
import * as __relkit_module_19 from "../../src/services/announcements/functions/post-announcement.function.ts";
import * as __relkit_module_20 from "../../src/services/announcements/service.ts";
import * as __relkit_module_21 from "../../src/services/assets/buckets/assets.bucket.ts";
import * as __relkit_module_22 from "../../src/services/assets/functions/upload-assets.function.ts";
import * as __relkit_module_23 from "../../src/services/assets/service.ts";
import * as __relkit_module_24 from "../../src/services/auth/service.ts";
import * as __relkit_module_25 from "../../src/services/database/service.ts";
import * as __relkit_module_26 from "../../src/services/navigation/functions/browse-path.function.ts";
import * as __relkit_module_27 from "../../src/services/navigation/service.ts";
import * as __relkit_module_28 from "../../src/services/orders/agents/order-deep.agent.ts";
import * as __relkit_module_29 from "../../src/services/orders/agents/order-review.agent.ts";
import * as __relkit_module_30 from "../../src/services/orders/agents/order-support.agent.ts";
import * as __relkit_module_31 from "../../src/services/orders/buckets/agent-workspace.bucket.ts";
import * as __relkit_module_32 from "../../src/services/orders/cache/prices.cache.ts";
import * as __relkit_module_33 from "../../src/services/orders/cache/rate-limits.cache.ts";
import * as __relkit_module_34 from "../../src/services/orders/channels/order-updates.channel.ts";
import * as __relkit_module_35 from "../../src/services/orders/errors/order-not-found.error.ts";
import * as __relkit_module_36 from "../../src/services/orders/functions/authorize-order.function.ts";
import * as __relkit_module_37 from "../../src/services/orders/functions/create-order.function.ts";
import * as __relkit_module_38 from "../../src/services/orders/functions/delete-order.function.ts";
import * as __relkit_module_39 from "../../src/services/orders/functions/get-order.function.ts";
import * as __relkit_module_40 from "../../src/services/orders/functions/search-orders.function.ts";
import * as __relkit_module_41 from "../../src/services/orders/functions/stream-order-report.function.ts";
import * as __relkit_module_42 from "../../src/services/orders/functions/update-order.function.ts";
import * as __relkit_module_43 from "../../src/services/orders/jobs/cleanup-orders.job.ts";
import * as __relkit_module_44 from "../../src/services/orders/jobs/export-orders.job.ts";
import * as __relkit_module_45 from "../../src/services/orders/service.ts";
import * as __relkit_module_46 from "../../src/services/orders/tasks/cleanup-orders.task.ts";
import * as __relkit_module_47 from "../../src/services/orders/tasks/export-orders.task.ts";
import * as __relkit_module_48 from "../../src/services/orders/tools/cancel-order.tool.ts";
import * as __relkit_module_49 from "../../src/services/orders/tools/lookup-order.tool.ts";
import * as __relkit_module_50 from "../../src/services/receipts/buckets/receipts.bucket.ts";
import * as __relkit_module_51 from "../../src/services/receipts/errors/receipt-storage-unavailable.error.ts";
import * as __relkit_module_52 from "../../src/services/receipts/functions/send-receipt.function.ts";
import * as __relkit_module_53 from "../../src/services/receipts/service.ts";
import * as __relkit_module_54 from "../../src/services/users/functions/database-users.function.ts";
import * as __relkit_module_55 from "../../src/services/users/service.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "commerce-api");
__relkit_bindDescriptorIdentity(__relkit_module_1["GET"], "route.get.account.profile");
__relkit_bindDescriptorIdentity(__relkit_module_1["GET"]["target"], "account.account-session");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"], "route.get.announcements");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"]["target"], "announcements.get-announcements");
__relkit_bindDescriptorIdentity(__relkit_module_2["POST"], "route.post.announcements");
__relkit_bindDescriptorIdentity(__relkit_module_2["POST"]["target"], "announcements.post-announcement");
__relkit_bindDescriptorIdentity(__relkit_module_3["ALL"], "route.all.api.auth.optional-catch-all-auth");
__relkit_bindDescriptorIdentity(__relkit_module_4["GET"], "route.get.database.users");
__relkit_bindDescriptorIdentity(__relkit_module_4["GET"]["target"], "users.database-users");
__relkit_bindDescriptorIdentity(__relkit_module_5["GET"], "route.get.docs.optional-catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_5["GET"]["target"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_6["GET"], "route.get.files.catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_6["GET"]["target"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_7["default"], "order-auth");
__relkit_bindDescriptorIdentity(__relkit_module_8["DELETE"], "route.delete.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_8["DELETE"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_8["GET"], "route.get.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_8["GET"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_8["GET"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_8["HEAD"], "route.head.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_8["HEAD"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_8["HEAD"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_8["OPTIONS"], "route.options.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_8["OPTIONS"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_8["OPTIONS"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_8["PATCH"], "route.patch.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_8["PATCH"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_8["PUT"], "route.put.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_8["PUT"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_9["POST"], "orders.export");
__relkit_bindDescriptorIdentity(__relkit_module_10["GET"], "route.get.orders");
__relkit_bindDescriptorIdentity(__relkit_module_10["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_10["POST"], "route.post.orders");
__relkit_bindDescriptorIdentity(__relkit_module_10["POST"]["target"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_10["POST"]["target"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_11["GET"], "route.get.orders.search");
__relkit_bindDescriptorIdentity(__relkit_module_11["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_12["GET"], "route.get.reports.by-report-id");
__relkit_bindDescriptorIdentity(__relkit_module_12["GET"]["target"], "orders.stream-order-report");
__relkit_bindDescriptorIdentity(__relkit_module_13["default"], "orders.normalize-id");
__relkit_bindDescriptorIdentity(__relkit_module_14["POST"], "route.post.uploads");
__relkit_bindDescriptorIdentity(__relkit_module_14["POST"]["target"], "assets.upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_14["POST"]["target"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_15["default"], "account.account-session");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"], "account");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"]["accountSession"], "account.account-session");
__relkit_bindDescriptorIdentity(__relkit_module_17["default"], "announcements.feed");
__relkit_bindDescriptorIdentity(__relkit_module_18["default"], "announcements.get-announcements");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"], "announcements.post-announcement");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"], "announcements");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"]["getAnnouncements"], "announcements.get-announcements");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"]["postAnnouncement"], "announcements.post-announcement");
__relkit_bindDescriptorIdentity(__relkit_module_21["default"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_22["default"], "assets.upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_22["default"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"], "assets");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["uploadAssets"], "assets.upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["uploadAssets"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_24["default"], "auth");
__relkit_bindDescriptorIdentity(__relkit_module_25["default"], "database");
__relkit_bindDescriptorIdentity(__relkit_module_26["default"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_27["default"], "navigation");
__relkit_bindDescriptorIdentity(__relkit_module_27["default"]["browsePath"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_28["default"], "orders.order-deep");
__relkit_bindDescriptorIdentity(__relkit_module_28["default"]["backend"], "orders.agent-workspace");
__relkit_bindDescriptorIdentity(__relkit_module_28["default"]["subagents"][0], "inventory-specialist");
__relkit_bindDescriptorIdentity(__relkit_module_29["default"], "orders.order-review");
__relkit_bindDescriptorIdentity(__relkit_module_30["default"], "orders.order-support");
__relkit_bindDescriptorIdentity(__relkit_module_31["default"], "orders.agent-workspace");
__relkit_bindDescriptorIdentity(__relkit_module_32["default"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_33["default"], "orders.rate-limits");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"], "orders.updates");
__relkit_bindDescriptorIdentity(__relkit_module_35["default"], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_36["default"], "orders.authorize-order");
__relkit_bindDescriptorIdentity(__relkit_module_37["default"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_37["default"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_38["default"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_39["default"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_39["default"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_40["default"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_41["default"], "orders.stream-order-report");
__relkit_bindDescriptorIdentity(__relkit_module_42["default"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_43["default"], "orders.cleanup");
__relkit_bindDescriptorIdentity(__relkit_module_43["default"]["task"], "orders.cleanup");
__relkit_bindDescriptorIdentity(__relkit_module_44["default"], "orders.export-orders");
__relkit_bindDescriptorIdentity(__relkit_module_44["default"]["task"], "orders.export-orders");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"], "orders");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["authorizeOrder"], "orders.authorize-order");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["cleanupOrders"], "orders.cleanup");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["cleanupOrders"]["task"], "orders.cleanup");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["cleanupOrdersTask"], "orders.cleanup");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["createOrder"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["createOrder"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["deleteOrder"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["exportOrders"], "orders.export-orders");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["exportOrders"]["task"], "orders.export-orders");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["exportOrdersTask"], "orders.export-orders");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["getOrder"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["getOrder"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["searchOrders"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["streamOrderReport"], "orders.stream-order-report");
__relkit_bindDescriptorIdentity(__relkit_module_45["default"]["updateOrder"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_46["default"], "orders.cleanup");
__relkit_bindDescriptorIdentity(__relkit_module_47["default"], "orders.export-orders");
__relkit_bindDescriptorIdentity(__relkit_module_48["default"], "orders.cancel-order");
__relkit_bindDescriptorIdentity(__relkit_module_48["default"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_49["default"], "orders.lookup-order");
__relkit_bindDescriptorIdentity(__relkit_module_49["default"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_49["default"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_50["default"], "receipts.objects");
__relkit_bindDescriptorIdentity(__relkit_module_51["default"], "receipts.storage-unavailable");
__relkit_bindDescriptorIdentity(__relkit_module_52["default"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_52["default"]["dependencies"]["buckets"]["receipts"], "receipts.objects");
__relkit_bindDescriptorIdentity(__relkit_module_52["default"]["errors"][0], "receipts.storage-unavailable");
__relkit_bindDescriptorIdentity(__relkit_module_53["default"], "receipts");
__relkit_bindDescriptorIdentity(__relkit_module_53["default"]["sendReceipt"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_53["default"]["sendReceipt"]["dependencies"]["buckets"]["receipts"], "receipts.objects");
__relkit_bindDescriptorIdentity(__relkit_module_53["default"]["sendReceipt"]["errors"][0], "receipts.storage-unavailable");
__relkit_bindDescriptorIdentity(__relkit_module_54["default"], "users.database-users");
__relkit_bindDescriptorIdentity(__relkit_module_55["default"], "users");
__relkit_bindDescriptorIdentity(__relkit_module_55["default"]["databaseUsers"], "users.database-users");

export const manifestContractVersion = 10 as const;
export const manifestGeneratorVersion = 7 as const;
export const manifestGraphHash = "sha256:ae476972c889c4c4cf6606ff62b485021878f0a542e7b2f392c8fb204a66201a" as const;
export const runtimeIntegrationsPlanReference = { version: 1, fileName: "runtime-integrations.plan.json", graphHash: manifestGraphHash } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  activationFingerprint: runtimeActivationFingerprint,
  functions: { "account.account-session": __relkit_module_15["default"].handler, "announcements.get-announcements": __relkit_module_18["default"].handler, "announcements.post-announcement": __relkit_module_19["default"].handler, "assets.upload-assets": __relkit_module_22["default"].handler, "navigation.browse-path": __relkit_module_26["default"].handler, "orders.authorize-order": __relkit_module_36["default"].handler, "orders.create-order": __relkit_module_37["default"].handler, "orders.delete-order": __relkit_module_38["default"].handler, "orders.get-order": __relkit_module_39["default"].handler, "orders.search-orders": __relkit_module_40["default"].handler, "orders.stream-order-report": __relkit_module_41["default"].handler, "orders.update-order": __relkit_module_42["default"].handler, "receipts.send-receipt": __relkit_module_52["default"].handler, "relkit.agent.orders.order-deep.invoke": __relkit_createGeneratedAgentFunction("orders.order-deep"), "relkit.agent.orders.order-review.invoke": __relkit_createGeneratedAgentFunction("orders.order-review"), "relkit.agent.orders.order-support.invoke": __relkit_createGeneratedAgentFunction("orders.order-support"), "users.database-users": __relkit_module_54["default"].handler },
  targets: { "account.account-session": __relkit_module_15["default"], "announcements.get-announcements": __relkit_module_18["default"], "announcements.post-announcement": __relkit_module_19["default"], "assets.upload-assets": __relkit_module_22["default"], "navigation.browse-path": __relkit_module_26["default"], "orders.authorize-order": __relkit_module_36["default"], "orders.create-order": __relkit_module_37["default"], "orders.delete-order": __relkit_module_38["default"], "orders.get-order": __relkit_module_39["default"], "orders.search-orders": __relkit_module_40["default"], "orders.stream-order-report": __relkit_module_41["default"], "orders.update-order": __relkit_module_42["default"], "receipts.send-receipt": __relkit_module_52["default"], "users.database-users": __relkit_module_54["default"] },
  agents: { "orders.order-deep": __relkit_module_28["default"], "orders.order-review": __relkit_module_29["default"], "orders.order-support": __relkit_module_30["default"] },
  channels: { "announcements.feed": __relkit_module_17["default"], "orders.updates": __relkit_module_34["default"] },
  tools: { "orders.cancel-order": __relkit_module_48["default"], "orders.lookup-order": __relkit_module_49["default"] },
  routes: { "orders.export": __relkit_module_9["POST"], "route.all.api.auth.optional-catch-all-auth": __relkit_module_3["ALL"], "route.delete.orders.by-order-id": __relkit_module_8["DELETE"], "route.get.account.profile": __relkit_module_1["GET"], "route.get.announcements": __relkit_module_2["GET"], "route.get.database.users": __relkit_module_4["GET"], "route.get.docs.optional-catch-all-parts": __relkit_module_5["GET"], "route.get.files.catch-all-parts": __relkit_module_6["GET"], "route.get.orders": __relkit_module_10["GET"], "route.get.orders.by-order-id": __relkit_module_8["GET"], "route.get.orders.search": __relkit_module_11["GET"], "route.get.reports.by-report-id": __relkit_module_12["GET"], "route.head.orders.by-order-id": __relkit_module_8["HEAD"], "route.options.orders.by-order-id": __relkit_module_8["OPTIONS"], "route.patch.orders.by-order-id": __relkit_module_8["PATCH"], "route.post.announcements": __relkit_module_2["POST"], "route.post.orders": __relkit_module_10["POST"], "route.post.uploads": __relkit_module_14["POST"], "route.put.orders.by-order-id": __relkit_module_8["PUT"] },
  constants: {  },
  prompts: {  },
  services: { "account": __relkit_module_16["default"], "announcements": __relkit_module_20["default"], "assets": __relkit_module_23["default"], "auth": __relkit_module_24["default"], "database": __relkit_module_25["default"], "navigation": __relkit_module_27["default"], "orders": __relkit_module_45["default"], "receipts": __relkit_module_53["default"], "users": __relkit_module_55["default"] },
  tasks: { "orders.cleanup": __relkit_module_46["default"], "orders.export-orders": __relkit_module_47["default"] },
  jobs: { "orders.cleanup": __relkit_module_43["default"], "orders.export-orders": __relkit_module_44["default"] },
  runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,
  middleware: { "order-auth": __relkit_module_7["default"] },
  hooks: {  },
  requestTransforms: { "orders.normalize-id": __relkit_module_13["default"].schema },
  application: __relkit_module_0["default"],
} as const;
