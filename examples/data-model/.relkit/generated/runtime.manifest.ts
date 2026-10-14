import runtimeActivationFingerprint from "./runtime-activation.json" with { type: "json" };
import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/app/internal/runtime";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/routes/users/route.ts";
import * as __relkit_module_2 from "../../src/services/database/service.ts";
import * as __relkit_module_3 from "../../src/services/users/functions/list-users.function.ts";
import * as __relkit_module_4 from "../../src/services/users/functions/register-member.function.ts";
import * as __relkit_module_5 from "../../src/services/users/functions/update-user-email.function.ts";
import * as __relkit_module_6 from "../../src/services/users/service.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "relkit.example-data-model");
__relkit_bindDescriptorIdentity(__relkit_module_1["GET"], "route.get.users");
__relkit_bindDescriptorIdentity(__relkit_module_1["GET"]["target"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"], "database");
__relkit_bindDescriptorIdentity(__relkit_module_3["default"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"], "users.register-member");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"], "users.update-user-email");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"], "users");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"]["listUsers"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"]["registerMember"], "users.register-member");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"]["updateUserEmail"], "users.update-user-email");

export const manifestContractVersion = 10 as const;
export const manifestGeneratorVersion = 7 as const;
export const manifestGraphHash = "sha256:251b5f77c79243b7a1fbd19e730adbb39508065bea3051a0b0e58da1c4e56028" as const;
export const runtimeIntegrationsPlanReference = { version: 1, fileName: "runtime-integrations.plan.json", graphHash: manifestGraphHash } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  activationFingerprint: runtimeActivationFingerprint,
  functions: { "users.list-users": __relkit_module_3["default"].handler, "users.register-member": __relkit_module_4["default"].handler, "users.update-user-email": __relkit_module_5["default"].handler },
  targets: { "users.list-users": __relkit_module_3["default"], "users.register-member": __relkit_module_4["default"], "users.update-user-email": __relkit_module_5["default"] },
  agents: {  },
  channels: {  },
  tools: {  },
  routes: { "route.get.users": __relkit_module_1["GET"] },
  constants: {  },
  prompts: {  },
  services: { "database": __relkit_module_2["default"], "users": __relkit_module_6["default"] },
  tasks: {  },
  jobs: {  },
  runtimeIntegrationsPlan: runtimeIntegrationsPlanReference,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __relkit_module_0["default"],
} as const;
