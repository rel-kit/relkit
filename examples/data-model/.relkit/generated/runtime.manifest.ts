import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/invocation";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/database/service.ts";
import * as __relkit_module_2 from "../../src/routes/users/route.ts";
import * as __relkit_module_3 from "../../src/users/functions/list-users.function.ts";
import * as __relkit_module_4 from "../../src/users/service.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "relkit.example-data-model");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "database");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"], "route.get.users");
__relkit_bindDescriptorIdentity(__relkit_module_2["GET"]["target"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_3["default"], "users.list-users");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"], "users");
__relkit_bindDescriptorIdentity(__relkit_module_4["default"]["listUsers"], "users.list-users");

export const manifestContractVersion = 6 as const;
export const manifestGeneratorVersion = 3 as const;
export const manifestGraphHash = "sha256:3d477fd9e04cc0c3dde317bea4e4d2cd9ff29d38ac47afe69205f8460c621968" as const;
export const providerFactories = {  } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "users.list-users": __relkit_module_3["default"].handler },
  targets: { "users.list-users": __relkit_module_3["default"] },
  agents: {  },
  tools: {  },
  routes: { "route.get.users": __relkit_module_2["GET"] },
  constants: {  },
  prompts: {  },
  services: { "database": __relkit_module_1["default"], "users": __relkit_module_4["default"] },
  providers: providerFactories,
  providerFactories,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __relkit_module_0["default"],
} as const;
