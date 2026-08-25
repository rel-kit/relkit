import { makeFailure } from "./failure-runtime.js";
import type { ProviderFailure } from "./failure-types.js";

export function dependencyNotConfiguredFailure(cause: {
  readonly category: string;
  readonly dependencyName: string;
}): ProviderFailure {
  return makeFailure(
    {
      _tag: "ProviderFailure",
      kind: "provider",
      outcome: "provider-failure",
      code: "ZSYS_DEPENDENCY_NOT_CONFIGURED",
      message: `Managed dependency "${cause.category}.${cause.dependencyName}" is not configured`,
      capability: cause.category,
      profile: cause.dependencyName,
    },
    cause,
  ) as ProviderFailure;
}
