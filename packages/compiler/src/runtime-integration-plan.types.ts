/** Graph projection containing provider and telemetry registration requirements. */
export interface RuntimeIntegrationGraph {
  readonly nodes: readonly { readonly kind: string; readonly id: string }[];
  readonly edges: readonly { readonly kind: string; readonly to: string }[];
}

/** Graph provider node carrying runtime adapter identity. */
export interface RuntimeProviderNode {
  readonly kind: "provider";
  readonly id: string;
  readonly capability: string;
  readonly adapter: {
    readonly integrationId: string;
    readonly adapterId: string;
    readonly protocolVersion: number;
  };
}

/** Stable package ownership and runtime registration validation codes. */
export type RuntimeIntegrationPlanErrorCode =
  | "RELKIT_RUNTIME_INTEGRATION_PACKAGE_MISSING"
  | "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID"
  | "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE";
