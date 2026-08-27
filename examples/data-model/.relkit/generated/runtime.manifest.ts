import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/invocation";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/data/application.data-model.ts";
import * as __relkit_module_2 from "../../src/functions/list-users.function.ts";
import * as __relkit_module_3 from "../../src/routes/users/route.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "relkit.example-data-model");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "application");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"], "list-users");
__relkit_bindDescriptorIdentity(__relkit_module_3["GET"], "route.get.users");
__relkit_bindDescriptorIdentity(__relkit_module_3["GET"]["target"], "list-users");

export const manifestContractVersion = 5 as const;
export const manifestGeneratorVersion = 2 as const;
export const manifestGraphHash = "sha256:e9706e36ca20663a1bb9885da180d58579420fde4e7f042fe5524cdc55511e1b" as const;
export const providerFactories = {  } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "list-users": __relkit_module_2["default"].handler },
  targets: { "list-users": __relkit_module_2["default"] },
  agents: {  },
  tools: {  },
  routes: { "route.get.users": __relkit_module_3["GET"] },
  constants: {  },
  prompts: {  },
  dataModel: __relkit_module_1["default"],
  services: {  },
  providers: providerFactories,
  providerFactories,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __relkit_module_0["default"],
} as const;
