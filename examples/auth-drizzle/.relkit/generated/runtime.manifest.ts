import runtimeActivationFingerprint from "./runtime-activation.json" with { type: "json" };
import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/app";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/account/functions/session.function.ts";
import * as __relkit_module_2 from "../../src/account/service.ts";
import * as __relkit_module_3 from "../../src/auth/service.ts";
import * as __relkit_module_4 from "../../src/database/service.ts";
import * as __relkit_module_5 from "../../src/routes/account/profile/route.ts";
import * as __relkit_module_6 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __relkit_module_7 from "../../src/routes/session/route.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "relkit.example-auth-drizzle");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "account.session");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"], "account");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"]["session"], "account.session");
__relkit_bindDescriptorIdentity(__relkit_module_3["default"], "auth");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"], "database");
__relkit_bindDescriptorIdentity(__relkit_module_5["GET"], "route.get.account.profile");
__relkit_bindDescriptorIdentity(__relkit_module_5["GET"]["target"], "account.session");
__relkit_bindDescriptorIdentity(__relkit_module_6["ALL"], "route.all.api.auth.optional-catch-all-auth");
__relkit_bindDescriptorIdentity(__relkit_module_7["GET"], "route.get.session");
__relkit_bindDescriptorIdentity(__relkit_module_7["GET"]["target"], "account.session");

export const manifestContractVersion = 8 as const;
export const manifestGeneratorVersion = 5 as const;
export const manifestGraphHash = "sha256:9d12949fea4129657bfd838940ee1597080c3e78ba98268488647c079ca0e7a5" as const;
export const runtimeIntegrationsPlanReference = { version: 1, fileName: "runtime-integrations.plan.json", graphHash: manifestGraphHash } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  activationFingerprint: runtimeActivationFingerprint,
  functions: { "account.session": __relkit_module_1["default"].handler },
  targets: { "account.session": __relkit_module_1["default"] },
  agents: {  },
  tools: {  },
  routes: { "route.all.api.auth.optional-catch-all-auth": __relkit_module_6["ALL"], "route.get.account.profile": __relkit_module_5["GET"], "route.get.session": __relkit_module_7["GET"] },
  constants: {  },
  prompts: {  },
  services: { "account": __relkit_module_2["default"], "auth": __relkit_module_3["default"], "database": __relkit_module_4["default"] },
  runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __relkit_module_0["default"],
} as const;
