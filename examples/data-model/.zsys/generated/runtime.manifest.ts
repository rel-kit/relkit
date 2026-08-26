import { bindDescriptorIdentity as __zsys_bindDescriptorIdentity } from "@zsys/invocation";
import * as __zsys_module_0 from "../../src/data/application.data-model.ts";
import * as __zsys_module_1 from "../../src/functions/list-users.function.ts";
import * as __zsys_module_2 from "../../src/routes/users/route.ts";
import * as __zsys_module_3 from "../../zsys.config.ts";

__zsys_bindDescriptorIdentity(__zsys_module_0["default"], "application");
__zsys_bindDescriptorIdentity(__zsys_module_1["default"], "list-users");
__zsys_bindDescriptorIdentity(__zsys_module_2["GET"], "route.get.users");
__zsys_bindDescriptorIdentity(__zsys_module_2["GET"]["target"], "list-users");
__zsys_bindDescriptorIdentity(__zsys_module_3["default"], "zsys.example-data-model");

export const manifestContractVersion = 5 as const;
export const manifestGeneratorVersion = 2 as const;
export const manifestGraphHash = "sha256:08c5682166b3e5e6e5e6b1c4bf4eaebd1482dfe4348d964b3c234e9d8a6905aa" as const;
export const providerFactories = {  } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "list-users": __zsys_module_1["default"].handler },
  targets: { "list-users": __zsys_module_1["default"] },
  agents: {  },
  tools: {  },
  routes: { "route.get.users": __zsys_module_2["GET"] },
  constants: {  },
  prompts: {  },
  dataModel: __zsys_module_0["default"],
  services: {  },
  providers: providerFactories,
  providerFactories,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __zsys_module_3["default"],
} as const;
