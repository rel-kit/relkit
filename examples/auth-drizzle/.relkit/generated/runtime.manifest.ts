import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/invocation";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/data/auth.data-model.ts";
import * as __relkit_module_2 from "../../src/functions/session.function.ts";
import * as __relkit_module_3 from "../../src/routes/account/profile/route.ts";
import * as __relkit_module_4 from "../../src/routes/api/auth/[[...auth]]/route.ts";
import * as __relkit_module_5 from "../../src/routes/session/route.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "relkit.example-auth-drizzle");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "auth");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"], "session");
__relkit_bindDescriptorIdentity(__relkit_module_3["GET"], "route.get.account.profile");
__relkit_bindDescriptorIdentity(__relkit_module_3["GET"]["target"], "session");
__relkit_bindDescriptorIdentity(__relkit_module_4["ALL"], "route.all.api.auth.optional-catch-all-auth");
__relkit_bindDescriptorIdentity(__relkit_module_5["GET"], "route.get.session");
__relkit_bindDescriptorIdentity(__relkit_module_5["GET"]["target"], "session");

export const manifestContractVersion = 5 as const;
export const manifestGeneratorVersion = 2 as const;
export const manifestGraphHash = "sha256:ac3c89cbe62468d4de95d2f5f1e512dfae06f3d0919a96983d959b64b046d8b1" as const;
export const providerFactories = {  } as const;
export const runtimeManifest = {
  contractVersion: manifestContractVersion,
  generatorVersion: manifestGeneratorVersion,
  graphHash: manifestGraphHash,
  functions: { "session": __relkit_module_2["default"].handler },
  targets: { "session": __relkit_module_2["default"] },
  agents: {  },
  tools: {  },
  routes: { "route.all.api.auth.optional-catch-all-auth": __relkit_module_4["ALL"], "route.get.account.profile": __relkit_module_3["GET"], "route.get.session": __relkit_module_5["GET"] },
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
