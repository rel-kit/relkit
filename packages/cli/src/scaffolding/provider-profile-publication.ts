/** Publishes validated provider declarations after identity and reuse checks finish. */

import { Effect } from "effect";

import { PlanBuilder } from "./plan-builder.js";

import type { DiscoveredProfile } from "./project-discovery-types.js";

import { requireAwsDeployment } from "./provider-planning-definitions.js";

import { addFactoryObjectMember, addSourceImport } from "./source-edit.js";

import { ensureEnvironmentEffect } from "./provider-environment.js";
import type { ProviderDefinition } from "./provider-planning-definitions.js";
import type { ProviderCapability, EnsureProfileOptions } from "./provider-planning.types.js";
export const configureProviderProfile = Effect.fn("Scaffold.configureProviderProfile")(function* (
  builder: PlanBuilder,
  capability: ProviderCapability,
  options: EnsureProfileOptions,
  configCapability: string,
  profiles: readonly DiscoveredProfile[],
  name: string,
  definition: ProviderDefinition,
) {
  if (options.source === "aws") requireAwsDeployment(builder.discovery.awsPulumiDeployment);
  for (const dependency of definition.dependencies) yield* builder.dependencyEffect(dependency);
  for (const declaration of definition.imports) {
    yield* builder.updateEffect("relkit.config.ts", (source) =>
      addSourceImport(source, "relkit.config.ts", declaration),
    );
  }
  for (const environment of definition.environment) {
    yield* ensureEnvironmentEffect(builder, environment.name, environment.definition);
  }
  yield* builder.updateEffect("relkit.config.ts", (source) => {
    const path = profiles.length === 0 ? [] : [configCapability];
    const member =
      profiles.length === 0
        ? `${configCapability}: { ${JSON.stringify(name)}: ${definition.expression} }`
        : `${JSON.stringify(name)}: ${definition.expression}`;
    return addFactoryObjectMember(
      source,
      "relkit.config.ts",
      [builder.discovery.appFactory],
      path,
      profiles.length === 0 ? configCapability : name,
      member,
    );
  });
  if (!profiles.some((item) => item.isDefault)) {
    yield* builder.updateEffect("relkit.config.ts", (source) =>
      addFactoryObjectMember(
        source,
        "relkit.config.ts",
        [builder.discovery.appFactory],
        ["defaults"],
        configCapability,
        `${configCapability}: "${name}"`,
      ),
    );
  }
  if (definition.warning)
    yield* builder.warningEffect(definition.warning.code, definition.warning.message);
  if (definition.adapter === "docker") yield* builder.nextStepEffect("relkit local up");
  yield* builder.registerProfileEffect({
    capability,
    name,
    adapter: definition.adapter,
    isDefault: !profiles.some((item) => item.isDefault),
  });
});
