import type { SourceFactoryKind } from "@relkit/compiler";
import type { DatabaseDialect } from "./add-types.js";

export interface DiscoveredServiceMember {
  readonly name: string;
  readonly targetBinding?: string;
}

export interface DiscoveredService {
  readonly domain: string;
  readonly path: string;
  readonly binding: string;
  readonly capability: "generic" | "database" | "auth";
  readonly dialect?: DatabaseDialect;
  readonly schemaPath?: string;
  readonly members: readonly DiscoveredServiceMember[];
}

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

export interface DiscoveredProfile {
  readonly capability: "bucket" | "cache" | "job" | "event" | "model";
  readonly name: string;
  readonly adapter?: string;
  readonly modelId?: string;
  readonly isDefault: boolean;
}

export interface ProjectDiscovery {
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
