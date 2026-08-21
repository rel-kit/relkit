import type { DescriptorKind } from "@zsys/contracts";

export type SourceFactoryKind =
  DescriptorKind | "error" | "middleware" | "service-middleware" | "transform";

export type FactoryIdPresence = "explicit" | "omitted" | "unknown";

export interface FactoryBindingFact {
  readonly binding?: string;
  readonly factory: string;
  readonly kind: SourceFactoryKind;
  readonly idOptional: boolean;
  readonly id: FactoryIdPresence;
  readonly position: number;
}

export interface RouteOperationFact {
  readonly exportName: string;
  readonly method: string;
  readonly binding?: string;
  readonly position: number;
}

export interface ServiceMemberFact {
  readonly service: string;
  readonly member: string;
  readonly targetBinding?: string;
  readonly position: number;
}

export interface ErrorBindingFact {
  readonly binding: string;
  readonly position: number;
  readonly id: FactoryIdPresence;
}

export interface ExportFact {
  readonly position: number;
  readonly binding?: string;
  readonly factory?: FactoryBindingFact;
  readonly routeOperation?: RouteOperationFact;
  readonly errorBinding?: ErrorBindingFact;
  readonly origin?: { readonly module: string; readonly name: string };
}

export interface ExportFacts {
  readonly exports: ReadonlyMap<string, ExportFact>;
  readonly stars: readonly { readonly module: string; readonly position: number }[];
  readonly factoryBindings: readonly FactoryBindingFact[];
  readonly routeOperations: readonly RouteOperationFact[];
  readonly serviceMembers: readonly ServiceMemberFact[];
  readonly errorBindings: readonly ErrorBindingFact[];
}

export type SourceFacts = ExportFacts;
