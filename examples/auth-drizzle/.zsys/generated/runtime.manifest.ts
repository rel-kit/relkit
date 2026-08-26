import { bindDescriptorIdentity as __zsys_bindDescriptorIdentity } from "@zsys/invocation";
import * as __zsys_module_0 from "../../src/data/auth.data-model.ts";
import * as __zsys_module_1 from "../../src/functions/session.function.ts";
import * as __zsys_module_2 from "../../src/routes/account/profile/route.ts";
import * as __zsys_module_3 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __zsys_module_4 from "../../src/routes/session/route.ts";
import * as __zsys_module_5 from "../../zsys.config.ts";

__zsys_bindDescriptorIdentity(__zsys_module_0["default"], "auth");
__zsys_bindDescriptorIdentity(__zsys_module_1["default"], "session");
__zsys_bindDescriptorIdentity(__zsys_module_2["GET"], "route.get.account.profile");
__zsys_bindDescriptorIdentity(__zsys_module_2["GET"]["target"], "session");
__zsys_bindDescriptorIdentity(__zsys_module_3["ALL"], "route.all.api.auth.optional-catch-all-auth");
__zsys_bindDescriptorIdentity(__zsys_module_4["GET"], "route.get.session");
__zsys_bindDescriptorIdentity(__zsys_module_4["GET"]["target"], "session");
__zsys_bindDescriptorIdentity(__zsys_module_5["default"], "zsys.example-auth-drizzle");

export const manifestContractVersion = 5 as const;
export const manifestGeneratorVersion = 2 as const;
export const manifestGraphHash = "sha256:a326954463bcb51c91ad06f1e3c1a49cdeaa64e72f58656b843dea40e6dd810f" as const;
export const providerFactories = {  } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "session": __zsys_module_1["default"].handler },
  targets: { "session": __zsys_module_1["default"] },
  agents: {  },
  tools: {  },
  routes: { "route.all.api.auth.optional-catch-all-auth": __zsys_module_3["ALL"], "route.get.account.profile": __zsys_module_2["GET"], "route.get.session": __zsys_module_4["GET"] },
  constants: {  },
  prompts: {  },
  dataModel: __zsys_module_0["default"],
  services: {  },
  providers: providerFactories,
  providerFactories,
  middleware: {  },
  hooks: {  },
  requestTransforms: {  },
  application: __zsys_module_5["default"],
} as const;
