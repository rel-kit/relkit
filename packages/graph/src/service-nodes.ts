import type { SourceLocation } from "@relkit/contracts";

export interface ServiceMemberRef {
  readonly name: string;
  readonly functionId: string;
}

export interface DrizzleColumnMetadata {
  readonly key: string;
  readonly name: string;
  readonly dataType: string;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
  readonly primaryKey: boolean;
  readonly unique: boolean;
}

export interface DrizzleTableMetadata {
  readonly name: string;
  readonly databaseName: string;
  readonly columns: readonly DrizzleColumnMetadata[];
  readonly selectors: readonly (readonly string[])[];
  readonly customMethods: readonly string[];
}

export type ServiceCapability =
  | {
      readonly kind: "drizzle";
      readonly dialect: "pg" | "mysql" | "sqlite";
      readonly tables: readonly DrizzleTableMetadata[];
    }
  | {
      readonly kind: "better-auth";
      readonly basePath: string;
      readonly databaseServiceId: string;
    };

export interface ServiceEventRef {
  readonly name: string;
  readonly eventId: string;
}

export interface ServiceNode {
  readonly kind: "service";
  readonly id: string;
  readonly source: SourceLocation;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly functions: readonly ServiceMemberRef[];
  readonly events: readonly ServiceEventRef[];
  readonly capability?: ServiceCapability;
}

export interface ExposesFunctionEdge {
  readonly kind: "exposes-function";
  readonly from: string;
  readonly to: string;
  readonly member: string;
  readonly order: number;
}

export interface ExposesEventEdge {
  readonly kind: "exposes-event";
  readonly from: string;
  readonly to: string;
  readonly member: string;
  readonly order: number;
}
