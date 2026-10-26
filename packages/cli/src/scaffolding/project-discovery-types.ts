/**
 * Defines immutable declaration-only scaffold discovery records. Compiler syntax
 * supplies layout/ownership; renderers preserve logical identities and provider
 * declarations while creating sources at their selected physical boundaries.
 */

import type { SourceFactoryKind } from "@relkit/compiler";
import type { ApplicationLayout } from "@relkit/contracts";
import type { DatabaseDialect } from "create-relkit/internal/add-types";

/**
 * Statically discovered service member name and referenced binding.
 */
export interface DiscoveredServiceMember {
  readonly name: string;
  readonly targetBinding?: string;
}

/**
 * Source-declared service identity, capability, members and optional database facts.
 */
export interface DiscoveredService {
  readonly domain: string;
  readonly path: string;
  readonly binding: string;
  readonly capability: "generic" | "database" | "auth";
  readonly dialect?: DatabaseDialect;
  readonly schemaPath?: string;
  readonly members: readonly DiscoveredServiceMember[];
}

/**
 * Static descriptor kind, identity, export form and owning source path.
 */
export interface DiscoveredArtifact {
  readonly kind: SourceFactoryKind;
  readonly path: string;
  readonly domain?: string;
  readonly binding: string;
  readonly id?: string;
  readonly factory: string;
  readonly exported: boolean;
  readonly exportKind?: "default" | "named";
  readonly options: readonly string[];
}

/**
 * Static provider capability, name, adapter/model identity and default selection.
 */
export interface DiscoveredProfile {
  readonly capability: "bucket" | "cache" | "job" | "event" | "model";
  readonly name: string;
  readonly adapter?: string;
  readonly modelId?: string;
  readonly isDefault: boolean;
}

/**
 * Deterministic source-only app, provider, service and artifact facts for one project.
 */
export interface ProjectDiscovery {
  /** Present on compiler-backed discovery; older supplied planning fixtures may omit it. */
  readonly layout?: ApplicationLayout;
  readonly projectRoot: string;
  readonly packagePath: string;
  readonly appPath: string;
  readonly appFactory: "defineApp" | "defineConfig";
  readonly envPath?: string;
  readonly services: readonly DiscoveredService[];
  readonly artifacts: readonly DiscoveredArtifact[];
  readonly profiles: readonly DiscoveredProfile[];
  readonly awsPulumiDeployment: boolean;
}
