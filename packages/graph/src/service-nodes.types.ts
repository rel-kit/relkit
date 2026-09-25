import type { SourceLocation } from "@relkit/contracts";

/**
 * Named function member exposed by a service.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ServiceMemberRef): void => { console.log(value); };
 */
export interface ServiceMemberRef {
  readonly name: string;
  readonly functionId: string;
}

/**
 * Column metadata for a Drizzle service table.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: DrizzleColumnMetadata): void => { console.log(value); };
 */
export interface DrizzleColumnMetadata {
  readonly key: string;
  readonly name: string;
  readonly dataType: string;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
  readonly primaryKey: boolean;
  readonly unique: boolean;
}

/**
 * Table and selector metadata for a Drizzle service.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: DrizzleTableMetadata): void => { console.log(value); };
 */
export interface DrizzleTableMetadata {
  readonly name: string;
  readonly databaseName: string;
  readonly columns: readonly DrizzleColumnMetadata[];
  readonly selectors: readonly (readonly string[])[];
  readonly customMethods: readonly string[];
}

/**
 * Optional capability-specific service metadata.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ServiceCapability): void => { console.log(value); };
 */
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

/**
 * Named event member exposed by a service.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ServiceEventRef): void => { console.log(value); };
 */
export interface ServiceEventRef {
  readonly name: string;
  readonly eventId: string;
}
/**
 * Named task member exposed by a service.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ServiceTaskRef): void => { console.log(value); };
 */
export interface ServiceTaskRef {
  readonly name: string;
  readonly taskId: string;
}
/**
 * Named job member exposed by a service.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ServiceJobRef): void => { console.log(value); };
 */
export interface ServiceJobRef {
  readonly name: string;
  readonly jobId: string;
}

/**
 * Service contract and its ordered member references.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ServiceNode): void => { console.log(value); };
 */
export interface ServiceNode {
  readonly kind: "service";
  readonly id: string;
  readonly source: SourceLocation;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly functions: readonly ServiceMemberRef[];
  readonly events: readonly ServiceEventRef[];
  readonly tasks?: readonly ServiceTaskRef[];
  readonly jobs?: readonly ServiceJobRef[];
  readonly capability?: ServiceCapability;
}

/**
 * Ordered edge from a service to a function member.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ExposesFunctionEdge): void => { console.log(value); };
 */
export interface ExposesFunctionEdge {
  readonly kind: "exposes-function";
  readonly from: string;
  readonly to: string;
  readonly member: string;
  readonly order: number;
}

/**
 * Ordered edge from a service to an event member.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ExposesEventEdge): void => { console.log(value); };
 */
export interface ExposesEventEdge {
  readonly kind: "exposes-event";
  readonly from: string;
  readonly to: string;
  readonly member: string;
  readonly order: number;
}

/**
 * Ordered edge from a service to a task member.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ExposesTaskEdge): void => { console.log(value); };
 */
export interface ExposesTaskEdge {
  readonly kind: "exposes-task";
  readonly from: string;
  readonly to: string;
  readonly member: string;
  readonly order: number;
}

/**
 * Ordered edge from a service to a job member.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ExposesJobEdge): void => { console.log(value); };
 */
export interface ExposesJobEdge {
  readonly kind: "exposes-job";
  readonly from: string;
  readonly to: string;
  readonly member: string;
  readonly order: number;
}
