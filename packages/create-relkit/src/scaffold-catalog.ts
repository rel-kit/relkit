export type DependencySection = "dependencies" | "devDependencies";

export interface ScaffoldDependency {
  readonly version: string;
  readonly section: DependencySection;
}

/** Versions copied into generated projects; tests keep these aligned with their owners. */
export const SCAFFOLD_DEPENDENCIES = Object.freeze({
  "@relkit/aws": { version: "0.4.0", section: "dependencies" },
  "@relkit/better-auth": { version: "0.4.0", section: "dependencies" },
  "@relkit/cloudflare": { version: "0.4.0", section: "dependencies" },
  "@relkit/docker": { version: "0.4.0", section: "dependencies" },
  "@relkit/drizzle": { version: "0.4.0", section: "dependencies" },
  "@relkit/local": { version: "0.4.0", section: "dependencies" },
  "@relkit/pulumi": { version: "0.4.0", section: "dependencies" },
  "@relkit/redis": { version: "0.4.0", section: "dependencies" },
  "@relkit/s3": { version: "0.4.0", section: "dependencies" },
  "better-auth": { version: "1.7.1", section: "dependencies" },
  "drizzle-kit": { version: "1.0.0-rc.5-ab785fc", section: "devDependencies" },
  "drizzle-orm": { version: "1.0.0-rc.5-169397b", section: "dependencies" },
  langchain: { version: "1.5.10", section: "dependencies" },
} satisfies Readonly<Record<string, ScaffoldDependency>>);

export type ScaffoldDependencyName = keyof typeof SCAFFOLD_DEPENDENCIES;

export function scaffoldDependency(name: ScaffoldDependencyName): ScaffoldDependency {
  return SCAFFOLD_DEPENDENCIES[name];
}
