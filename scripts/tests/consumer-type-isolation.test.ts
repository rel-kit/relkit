/** Strict emitted declarations with actual dependencies and deliberately unavailable optional peers. */
import { resolve } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";
import {
  authSource as auth,
  harnessSource,
  sqliteSource,
  sqliteMisuseSource,
} from "../consumer-type-sources.js";

const root = resolve(import.meta.dirname, "../..");
const consumer = resolve(root, "packages/testing/isolation-consumer.ts");
const frontend = /^(?:react(?:\/|$)|@tanstack\/|@orpc\/tanstack-query(?:\/|$))/;
const native =
  /^(?:@relkit\/(?:better-auth|drizzle|langchain)(?:\/|$)|better-auth(?:\/|$)|drizzle-orm(?:\/|$)|@langchain\/|deepagents(?:\/|$)|langsmith(?:\/|$)|@aws-sdk\/|@pulumi\/|@duckdb\/|duckdb(?:\/|$)|ioredis(?:\/|$)|@sentry\/|@opentelemetry\/(?:sdk|exporter)|@modelcontextprotocol\/|@ag-ui\/|@scalar\/|react(?:\/|$)|@tanstack\/)/;
const otherDrivers = new RegExp(
  `^(?:pg|mysql2|postgres|better-sqlite3|sqlite3|@libsql/client|@neondatabase/${["server", "less"].join("")})(?:/|$)`,
);

/** Resolves real declarations; withheld imports fail normally without ambient substitutes. */
function compile(source: string, unavailable: RegExp) {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    customConditions: ["bun"],
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["bun"],
    exactOptionalPropertyTypes: true,
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile;
  host.getSourceFile = (path, version, onError, fresh) =>
    path === consumer
      ? ts.createSourceFile(path, source, version, true)
      : read(path, version, onError, fresh);
  const requested: string[] = [];
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => {
      requested.push(name);
      return unavailable.test(name)
        ? undefined
        : ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
    });
  const program = ts.createProgram([consumer], options, host);
  return {
    requested,
    diagnostics: ts
      .getPreEmitDiagnostics(program)
      .map(
        (item) =>
          `${item.file?.fileName}:${item.code}: ${ts.flattenDiagnosticMessageText(item.messageText, " ")}`,
      ),
    files: program.getSourceFiles().map((file) => file.fileName),
  };
}

test("backend_auth_without_react_and_without_relkit_drizzle", () => {
  const result = compile(auth, /^(?:react(?:\/|$)|@relkit\/drizzle(?:\/|$))/);
  expect(result.diagnostics).toEqual([]);
  expect(
    result.requested.filter((name) => frontend.test(name) || name.startsWith("@relkit/drizzle")),
  ).toEqual([]);
  expect(result.files.some((file) => file.endsWith("/better-auth/dist/index.d.ts"))).toBe(true);
}, 30_000);

test("selected_drizzle_auth_without_react", () => {
  const result = compile(
    `${auth}
import { activateBetterAuthService, type AuthConfiguration } from "@relkit/better-auth/drizzle";
declare const database: AuthConfiguration["database"];
const active = activateBetterAuthService(auth, database, "/api/auth");
`,
    frontend,
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.requested.filter((name) => frontend.test(name))).toEqual([]);
}, 30_000);

test("backend_auth_preserves_session_misuse_errors", () => {
  const result = compile(`${auth}\nconst invalid: number = session.user.email;`, frontend);
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]).toContain(":2322:");
}, 30_000);

test("minimal_harness_no_provider_sdks", () => {
  const result = compile(harnessSource, native);
  expect(result.diagnostics).toEqual([]);
  expect(result.requested.filter((name) => native.test(name))).toEqual([]);
}, 30_000);

test("single_database_driver_preserves_real_sqlite_inference", () => {
  const result = compile(
    sqliteSource,
    new RegExp(`${otherDrivers.source}|^better-auth(?:/|$)|^@relkit/better-auth(?:/|$)`),
  );
  expect(result.diagnostics).toEqual([]);
  expect(result.requested.filter((name) => otherDrivers.test(name))).toEqual([]);
  expect(result.requested).not.toContain("better-auth");
  const misuse = compile(sqliteMisuseSource, otherDrivers);
  expect(misuse.diagnostics).toHaveLength(1);
  expect(misuse.diagnostics[0]).toContain(":2322:");
}, 30_000);
