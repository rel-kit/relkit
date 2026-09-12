import manifest from "../package.json" with { type: "json" };

export type DependencySection = "dependencies" | "devDependencies";

export interface ScaffoldDependency {
  readonly version: string;
  readonly section: DependencySection;
}

/** Versions copied into generated projects; first-party packages share this fixed release train. */
export const SCAFFOLD_DEPENDENCIES = Object.freeze({
  "@relkit/aws": { version: manifest.version, section: "dependencies" },
  "@relkit/better-auth": { version: manifest.version, section: "dependencies" },
  "@relkit/cloudflare": { version: manifest.version, section: "dependencies" },
  "@relkit/docker": { version: manifest.version, section: "dependencies" },
  "@relkit/drizzle": { version: manifest.version, section: "dependencies" },
  "@relkit/local": { version: manifest.version, section: "dependencies" },
  "@relkit/pulumi": { version: manifest.version, section: "dependencies" },
  "@relkit/redis": { version: manifest.version, section: "dependencies" },
  "@relkit/s3": { version: manifest.version, section: "dependencies" },
  "better-auth": { version: "1.7.1", section: "dependencies" },
  "drizzle-kit": { version: "1.0.0-rc.5-ab785fc", section: "devDependencies" },
  "drizzle-orm": { version: "1.0.0-rc.5-169397b", section: "dependencies" },
  langchain: { version: "1.5.10", section: "dependencies" },
} satisfies Readonly<Record<string, ScaffoldDependency>>);

export type ScaffoldDependencyName = keyof typeof SCAFFOLD_DEPENDENCIES;

export function scaffoldDependency(name: ScaffoldDependencyName): ScaffoldDependency {
  return SCAFFOLD_DEPENDENCIES[name];
}
