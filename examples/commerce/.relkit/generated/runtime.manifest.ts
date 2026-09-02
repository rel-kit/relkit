import runtimeActivationFingerprint from "./runtime-activation.json" with { type: "json" };
import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/app";
import { createGeneratedAgentFunction as __relkit_createGeneratedAgentFunction } from "@relkit/app";
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
import * as __relkit_module_12 from "../../src/orders/cache/rate-limits.cache.ts";
import * as __relkit_module_13 from "../../src/orders/functions/authorize-order.function.ts";
import * as __relkit_module_14 from "../../src/orders/functions/create-order.function.ts";
import * as __relkit_module_15 from "../../src/orders/functions/delete-order.function.ts";
import * as __relkit_module_16 from "../../src/orders/functions/get-order.function.ts";
import * as __relkit_module_17 from "../../src/orders/functions/search-orders.function.ts";
import * as __relkit_module_18 from "../../src/orders/functions/update-order.function.ts";
import * as __relkit_module_19 from "../../src/orders/service.ts";
import * as __relkit_module_20 from "../../src/orders/tools/cancel-order.tool.ts";
import * as __relkit_module_21 from "../../src/orders/tools/lookup-order.tool.ts";
import * as __relkit_module_22 from "../../src/receipts/buckets/receipts.bucket.ts";
import * as __relkit_module_23 from "../../src/receipts/functions/send-receipt.function.ts";
import * as __relkit_module_24 from "../../src/receipts/service.ts";
import * as __relkit_module_25 from "../../src/routes/account/profile/route.ts";
import * as __relkit_module_26 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __relkit_module_27 from "../../src/routes/database/users/route.ts";
import * as __relkit_module_28 from "../../src/routes/docs/[[...parts]]/route.ts";
import * as __relkit_module_29 from "../../src/routes/files/[...parts]/route.ts";
import * as __relkit_module_30 from "../../src/routes/middleware/order-auth.middleware.ts";
import * as __relkit_module_31 from "../../src/routes/orders/[orderId]/route.ts";
import * as __relkit_module_32 from "../../src/routes/orders/route.ts";
import * as __relkit_module_33 from "../../src/routes/orders/search/route.ts";
import * as __relkit_module_34 from "../../src/routes/transforms/orders/normalize-id.transform.ts";
import * as __relkit_module_35 from "../../src/routes/uploads/route.ts";
import * as __relkit_module_36 from "../../src/users/functions/database-users.function.ts";
import * as __relkit_module_37 from "../../src/users/service.ts";

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
__relkit_bindDescriptorIdentity(__relkit_module_12["default"], "orders.rate-limits");
__relkit_bindDescriptorIdentity(__relkit_module_13["default"], "orders.authorize-order");
__relkit_bindDescriptorIdentity(__relkit_module_14["default"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_14["default"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_15["default"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_16["default"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_17["default"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_18["default"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"], "orders");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["authorizeOrder"], "orders.authorize-order");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["createOrder"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["createOrder"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["deleteOrder"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["getOrder"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["getOrder"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["searchOrders"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_19["default"]["updateOrder"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"], "orders.cancel-order");
__relkit_bindDescriptorIdentity(__relkit_module_20["default"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_21["default"], "orders.lookup-order");
__relkit_bindDescriptorIdentity(__relkit_module_21["default"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_21["default"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_22["default"], "receipts.objects");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_23["default"]["dependencies"]["buckets"]["receipts"], "receipts.objects");
__relkit_bindDescriptorIdentity(__relkit_module_24["default"], "receipts");
__relkit_bindDescriptorIdentity(__relkit_module_24["default"]["sendReceipt"], "receipts.send-receipt");
__relkit_bindDescriptorIdentity(__relkit_module_24["default"]["sendReceipt"]["dependencies"]["buckets"]["receipts"], "receipts.objects");
__relkit_bindDescriptorIdentity(__relkit_module_25["GET"], "route.get.account.profile");
__relkit_bindDescriptorIdentity(__relkit_module_25["GET"]["target"], "account.account-session");
__relkit_bindDescriptorIdentity(__relkit_module_26["ALL"], "route.all.api.auth.optional-catch-all-auth");
__relkit_bindDescriptorIdentity(__relkit_module_27["GET"], "route.get.database.users");
__relkit_bindDescriptorIdentity(__relkit_module_27["GET"]["target"], "users.database-users");
__relkit_bindDescriptorIdentity(__relkit_module_28["GET"], "route.get.docs.optional-catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_28["GET"]["target"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_29["GET"], "route.get.files.catch-all-parts");
__relkit_bindDescriptorIdentity(__relkit_module_29["GET"]["target"], "navigation.browse-path");
__relkit_bindDescriptorIdentity(__relkit_module_30["default"], "order-auth");
__relkit_bindDescriptorIdentity(__relkit_module_31["DELETE"], "route.delete.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_31["DELETE"]["target"], "orders.delete-order");
__relkit_bindDescriptorIdentity(__relkit_module_31["GET"], "route.get.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_31["GET"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_31["GET"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_31["HEAD"], "route.head.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_31["HEAD"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_31["HEAD"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_31["OPTIONS"], "route.options.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_31["OPTIONS"]["target"], "orders.get-order");
__relkit_bindDescriptorIdentity(__relkit_module_31["OPTIONS"]["target"]["errors"][0], "orders.not-found");
__relkit_bindDescriptorIdentity(__relkit_module_31["PATCH"], "route.patch.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_31["PATCH"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_31["PUT"], "route.put.orders.by-order-id");
__relkit_bindDescriptorIdentity(__relkit_module_31["PUT"]["target"], "orders.update-order");
__relkit_bindDescriptorIdentity(__relkit_module_32["GET"], "route.get.orders");
__relkit_bindDescriptorIdentity(__relkit_module_32["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_32["POST"], "route.post.orders");
__relkit_bindDescriptorIdentity(__relkit_module_32["POST"]["rateLimit"]["store"], "orders.rate-limits");
__relkit_bindDescriptorIdentity(__relkit_module_32["POST"]["target"], "orders.create-order");
__relkit_bindDescriptorIdentity(__relkit_module_32["POST"]["target"]["dependencies"]["cache"]["prices"], "orders.prices");
__relkit_bindDescriptorIdentity(__relkit_module_33["GET"], "route.get.orders.search");
__relkit_bindDescriptorIdentity(__relkit_module_33["GET"]["target"], "orders.search-orders");
__relkit_bindDescriptorIdentity(__relkit_module_34["default"], "orders.normalize-id");
__relkit_bindDescriptorIdentity(__relkit_module_35["POST"], "route.post.uploads");
__relkit_bindDescriptorIdentity(__relkit_module_35["POST"]["target"], "assets.upload-assets");
__relkit_bindDescriptorIdentity(__relkit_module_35["POST"]["target"]["dependencies"]["buckets"]["assets"], "assets.objects");
__relkit_bindDescriptorIdentity(__relkit_module_36["default"], "users.database-users");
__relkit_bindDescriptorIdentity(__relkit_module_37["default"], "users");
__relkit_bindDescriptorIdentity(__relkit_module_37["default"]["databaseUsers"], "users.database-users");

export const manifestContractVersion = 8 as const;
export const manifestGeneratorVersion = 5 as const;
export const manifestGraphHash = "sha256:908c961587733d698d205e170b8313bf8afbd5673f63b20bbf7366b5798eac61" as const;
export const runtimeIntegrationsPlanReference = { version: 1, fileName: "runtime-integrations.plan.json", graphHash: manifestGraphHash } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  activationFingerprint: runtimeActivationFingerprint,
  functions: { "account.account-session": __relkit_module_1["default"].handler, "assets.upload-assets": __relkit_module_4["default"].handler, "navigation.browse-path": __relkit_module_8["default"].handler, "orders.authorize-order": __relkit_module_13["default"].handler, "orders.create-order": __relkit_module_14["default"].handler, "orders.delete-order": __relkit_module_15["default"].handler, "orders.get-order": __relkit_module_16["default"].handler, "orders.search-orders": __relkit_module_17["default"].handler, "orders.update-order": __relkit_module_18["default"].handler, "receipts.send-receipt": __relkit_module_23["default"].handler, "relkit.agent.orders.order-support.invoke": __relkit_createGeneratedAgentFunction("orders.order-support"), "users.database-users": __relkit_module_36["default"].handler },
  targets: { "account.account-session": __relkit_module_1["default"], "assets.upload-assets": __relkit_module_4["default"], "navigation.browse-path": __relkit_module_8["default"], "orders.authorize-order": __relkit_module_13["default"], "orders.create-order": __relkit_module_14["default"], "orders.delete-order": __relkit_module_15["default"], "orders.get-order": __relkit_module_16["default"], "orders.search-orders": __relkit_module_17["default"], "orders.update-order": __relkit_module_18["default"], "receipts.send-receipt": __relkit_module_23["default"], "users.database-users": __relkit_module_36["default"] },
  agents: { "orders.order-support": __relkit_module_10["default"] },
  tools: { "orders.cancel-order": __relkit_module_20["default"], "orders.lookup-order": __relkit_module_21["default"] },
  routes: { "route.all.api.auth.optional-catch-all-auth": __relkit_module_26["ALL"], "route.delete.orders.by-order-id": __relkit_module_31["DELETE"], "route.get.account.profile": __relkit_module_25["GET"], "route.get.database.users": __relkit_module_27["GET"], "route.get.docs.optional-catch-all-parts": __relkit_module_28["GET"], "route.get.files.catch-all-parts": __relkit_module_29["GET"], "route.get.orders": __relkit_module_32["GET"], "route.get.orders.by-order-id": __relkit_module_31["GET"], "route.get.orders.search": __relkit_module_33["GET"], "route.head.orders.by-order-id": __relkit_module_31["HEAD"], "route.options.orders.by-order-id": __relkit_module_31["OPTIONS"], "route.patch.orders.by-order-id": __relkit_module_31["PATCH"], "route.post.orders": __relkit_module_32["POST"], "route.post.uploads": __relkit_module_35["POST"], "route.put.orders.by-order-id": __relkit_module_31["PUT"] },
  constants: {  },
  prompts: {  },
  services: { "account": __relkit_module_2["default"], "assets": __relkit_module_5["default"], "auth": __relkit_module_6["default"], "database": __relkit_module_7["default"], "navigation": __relkit_module_9["default"], "orders": __relkit_module_19["default"], "receipts": __relkit_module_24["default"], "users": __relkit_module_37["default"] },
  runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,
  middleware: { "order-auth": __relkit_module_30["default"] },
  hooks: {  },
  requestTransforms: { "orders.normalize-id": __relkit_module_34["default"].schema },
  application: __relkit_module_0["default"],
} as const;
