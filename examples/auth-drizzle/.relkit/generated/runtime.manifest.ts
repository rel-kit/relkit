import runtimeActivationFingerprint from "./runtime-activation.json" with { type: "json" };
import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "relkit/host";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/routes/account/profile/route.ts";
import * as __relkit_module_2 from "../../src/routes/session/route.ts";
import * as __relkit_module_3 from "../../src/services/account/functions/session.function.ts";
import * as __relkit_module_4 from "../../src/services/account/service.ts";
import * as __relkit_module_5 from "../../src/services/auth/service.ts";
import * as __relkit_module_6 from "../../src/services/database/service.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "relkit.example-auth-drizzle");
__relkit_bindDescriptorIdentity(__relkit_module_1["GET"], "route.get.account.profile");
__relkit_bindDescriptorIdentity(__relkit_module_1["GET"]["target"], "account.session");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"], "route.get.session");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"]["target"], "account.session");
__relkit_bindDescriptorIdentity(__relkit_module_3["default"], "account.session");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"], "account");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"]["session"], "account.session");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"], "auth");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"], "database");

export const manifestContractVersion = 10 as const;
export const manifestGeneratorVersion = 7 as const;
export const manifestGraphHash = "sha256:949bf9d85ac8316df2764ebe8d4a794f8464a2ab0a9b14a8897fa26e6b6a06d9" as const;
export const runtimeIntegrationsPlanReference = { version: 1, fileName: "runtime-integrations.plan.json", graphHash: manifestGraphHash } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  activationFingerprint: runtimeActivationFingerprint,
  functions: { "account.session": __relkit_module_3["default"].handler },
  targets: { "account.session": __relkit_module_3["default"] },
  agents: {  },
  channels: {  },
  tools: {  },
  routes: { "route.get.account.profile": __relkit_module_1["GET"], "route.get.session": __relkit_module_2["GET"] },
  constants: {  },
  prompts: {  },
  services: { "account": __relkit_module_4["default"], "auth": __relkit_module_5["default"], "database": __relkit_module_6["default"] },
  tasks: {  },
  jobs: {  },
  runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __relkit_module_0["default"],
} as const;
