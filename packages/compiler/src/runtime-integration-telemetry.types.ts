/** Capability registration identity required by provider or telemetry graph metadata. */
export interface RuntimeIntegrationRequirement {
  readonly integrationId: string;
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
}

/** Graph projection containing provider and telemetry registration requirements. */
export interface RuntimeIntegrationGraph {
  readonly nodes: readonly { readonly kind: string; readonly id: string }[];
}
