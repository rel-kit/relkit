import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/invocation";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/database/service.ts";
import * as __relkit_module_2 from "../../src/routes/users/route.ts";
import * as __relkit_module_3 from "../../src/users/functions/list-users.function.ts";
import * as __relkit_module_4 from "../../src/users/functions/register-member.function.ts";
import * as __relkit_module_5 from "../../src/users/functions/update-user-email.function.ts";
import * as __relkit_module_6 from "../../src/users/service.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "relkit.example-data-model");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "database");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"], "route.get.users");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"]["target"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_3["default"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"], "users.register-member");
__relkit_bindDescriptorIdentity(__relkit_module_5["default"], "users.update-user-email");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"], "users");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"]["listUsers"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"]["registerMember"], "users.register-member");
__relkit_bindDescriptorIdentity(__relkit_module_6["default"]["updateUserEmail"], "users.update-user-email");

export const manifestContractVersion = 7 as const;
export const manifestGeneratorVersion = 4 as const;
export const manifestGraphHash = "sha256:5aa5396dff50fcbd3dd42f25d0d0f7cd2e5b13da03d6a6041e569d137e3a4331" as const;
export const providerFactories = {  } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "users.list-users": __relkit_module_3["default"].handler, "users.register-member": __relkit_module_4["default"].handler, "users.update-user-email": __relkit_module_5["default"].handler },
  targets: { "users.list-users": __relkit_module_3["default"], "users.register-member": __relkit_module_4["default"], "users.update-user-email": __relkit_module_5["default"] },
  agents: {  },
  tools: {  },
  routes: { "route.get.users": __relkit_module_2["GET"] },
  constants: {  },
  prompts: {  },
  services: { "database": __relkit_module_1["default"], "users": __relkit_module_6["default"] },
  providers: providerFactories,
  providerFactories,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __relkit_module_0["default"],
} as const;
