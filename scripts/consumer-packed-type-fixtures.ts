/** Builds independent native and client selections for strict packed declaration proof. */
import {
  authSource,
  harnessSource,
  sqliteSource,
  sqliteMisuseSource,
} from "./consumer-type-sources.js";
import type { Manifest } from "./scaffold-process.types.js";
import type { PackedTypeFixture } from "./consumer-packed-type.types.js";
import { Schema } from "effect";
import {
  clientContractSource,
  clientMisuseSource,
  clientQuerySource,
  clientReactSource,
  clientQueryMisuse,
  clientQueryRuntime,
  clientReactRuntime,
} from "./consumer-client-sources.js";

const frontend = /^(?:react(?:-dom)?|@types\/react(?:-dom)?|@tanstack\/.*|@orpc\/tanstack-query)$/;
const drivers = new RegExp(
  `^(?:pg|mysql2|postgres|better-sqlite3|sqlite3|@libsql/client|@neondatabase/${["server", "less"].join("")})$`,
);
const native =
  /^(?:@relkit\/(?:better-auth|drizzle|langchain)|better-auth|drizzle-orm|@better-auth\/.*|@better-fetch\/.*|@cloudflare\/workers-types|@langchain\/.*|deepagents|langsmith|@aws-sdk\/.*|@pulumi\/.*|@duckdb\/.*|duckdb|ioredis|@sentry\/.*|@opentelemetry\/(?:sdk|exporter).*|@modelcontextprotocol\/.*|@ag-ui\/.*|@scalar\/.*)$/;

const cases: readonly Omit<PackedTypeFixture, "dependencies" | "devDependencies" | "production">[] =
  [
    {
      name: "backend-auth",
      source: authSource,
      negativeSource: `${authSource}\nconst invalid: number = session.user.email;`,
      forbidden: new RegExp(`${frontend.source}|^@relkit/drizzle$`),
      drizzle: false,
      auth: true,
    },
    {
      name: "selected-auth-bridge",
      source: `${authSource}\nimport { activateBetterAuthService, type AuthConfiguration } from "@relkit/better-auth/drizzle";
declare const database: AuthConfiguration["database"];
const active = activateBetterAuthService(auth, database, "/api/auth");`,
      forbidden: frontend,
      drizzle: true,
      auth: true,
    },
    {
      name: "general-testing",
      source: harnessSource,
      forbidden: new RegExp(`${native.source}|${frontend.source}`),
      drizzle: false,
      auth: false,
    },
    {
      name: "sqlite-only",
      source: sqliteSource,
      negativeSource: sqliteMisuseSource,
      forbidden: new RegExp(
        `${frontend.source}|${drivers.source}|^(?:better-auth|@relkit/better-auth)$`,
      ),
      drizzle: true,
      auth: false,
    },
    {
      name: "generic-server-client",
      source: clientContractSource,
      negativeSource: clientMisuseSource,
      negativeDiagnosticCodes: [2322, 2339, 2322],
      forbidden: new RegExp(`${native.source}|${frontend.source}`),
      drizzle: false,
      auth: false,
    },
    {
      name: "selected-client-query",
      source: clientQuerySource,
      negativeSource: clientQueryMisuse(clientQuerySource),
      runtimeSource: clientQueryRuntime,
      forbidden: new RegExp(
        `${native.source}|^(?:react(?:-dom)?|@types/react(?:-dom)?|@tanstack/react-query)$`,
      ),
      drizzle: false,
      auth: false,
    },
    {
      name: "selected-client-react",
      source: clientReactSource,
      negativeSource: clientQueryMisuse(clientReactSource),
      runtimeSource: clientReactRuntime,
      forbidden: native,
      drizzle: false,
      auth: false,
    },
  ];

/**
 * Retains exact packed first-party identities and actual upstream pins.
 * @param manifests - Candidate manifests verified by the shared registry adapter.
 * @param catalog - Native pins decoded from the packed creator.
 * @returns Serial, independent fixtures; no workspace dependency paths or SDK stubs.
 */
export function packedTypeFixtures(
  manifests: ReadonlyMap<string, { readonly manifest: Manifest }>,
  catalog: Readonly<Record<string, string>>,
): readonly PackedTypeFixture[] {
  const version = (name: string) => {
    const value =
      manifests.get(name)?.manifest.version ?? catalog[name] ?? packedClientPin(manifests, name);
    if (value === undefined || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value))
      throw new Error(`Packed type fixture dependency pin is absent or not exact: ${name}`);
    return value;
  };
  const devDependencies = {
    typescript: version("typescript"),
    "@types/bun": version("@types/bun"),
  };
  const authDependencies = {
    "@relkit/better-auth": version("@relkit/better-auth"),
    "better-auth": version("better-auth"),
  };
  const databaseDependencies = {
    "@relkit/drizzle": version("@relkit/drizzle"),
    "drizzle-orm": version("drizzle-orm"),
  };
  const dependencies: readonly Readonly<Record<string, string>>[] = [
    authDependencies,
    { ...authDependencies, ...databaseDependencies },
    { "@relkit/testing": version("@relkit/testing") },
    { ...databaseDependencies, "@relkit/testing": version("@relkit/testing") },
    clientDependencies(version, false, false),
    clientDependencies(version, true, false),
    clientDependencies(version, true, true),
  ];
  return cases.map((fixture, index) => {
    const selection = dependencies[index];
    if (selection === undefined) throw new Error(`Missing fixture selection: ${fixture.name}`);
    return {
      ...fixture,
      dependencies: selection,
      devDependencies: {
        ...devDependencies,
        ...(fixture.name === "selected-client-react"
          ? { "@types/react": version("@types/react") }
          : {}),
      },
      production: false,
    };
  });
}

/** Resolves exact selected frontend requirements from the packed dependency authority. */
function clientDependencies(version: (name: string) => string, query: boolean, react: boolean) {
  const names = ["@relkit/client", "@orpc/contract"];
  if (query) names.push("@orpc/tanstack-query", "@tanstack/query-core");
  if (react) names.push("react", "@tanstack/react-query");
  return Object.fromEntries(names.map((name) => [name, version(name)]));
}

/** Decodes the packed owner's dev pins before using its feature-specific version authority. */
function packedClientPin(
  manifests: ReadonlyMap<string, { readonly manifest: Manifest }>,
  name: string,
) {
  const pins = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(
    manifests.get("@relkit/client")?.manifest.devDependencies ?? {},
  );
  return pins[name];
}
