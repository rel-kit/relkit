/**
 * Supported artifact kinds accepted by relkit add.
 */
export const ADD_KINDS = [
  "service",
  "function",
  "error",
  "event",
  "event-function",
  "task",
  "job",
  "cache",
  "bucket",
  "tool",
  "prompt",
  "agent",
  "constants",
  "route",
  "middleware",
  "transform",
  "database",
  "auth",
] as const;

/**
 * Supported relkit add artifact discriminant.
 */
export type AddKind = (typeof ADD_KINDS)[number];
/**
 * Artifact kinds that can be included in a generic service scaffold.
 */
export type ServiceInclude = Exclude<
  AddKind,
  "service" | "database" | "auth" | "middleware" | "transform"
>;
/**
 * Supported HTTP method used by generated route mappings.
 */
export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
/**
 * Supported database dialect for Drizzle and authentication scaffolds.
 */
export type DatabaseDialect = "sqlite" | "postgresql" | "mysql";

/**
 * Project, installation and optional service selection shared by all add requests.
 */
export interface AddRequestBase {
  readonly projectRoot: string;
  readonly service?: string;
  readonly createService?: string;
  readonly install: boolean;
}

/**
 * Shared named-artifact fields combined with kind-specific options.
 * @typeParam Kind - Discriminant identifying the artifact kind.
 * @typeParam Options - Additional fields required by that artifact kind.
 */
type NamedRequest<Kind extends AddKind, Options = object> = AddRequestBase &
  Readonly<{ kind: Kind; name: string }> &
  Readonly<Options>;

/**
 * Validated discriminated union of supported artifact scaffold requests.
 */
export type AddRequest =
  | NamedRequest<"service", { full: boolean; include: readonly ServiceInclude[] }>
  | NamedRequest<"function", { internal: boolean }>
  | NamedRequest<"error">
  | NamedRequest<"event", { internal: boolean; profile?: string }>
  | NamedRequest<
      "event-function",
      { event: string; delivery: "transient" | "durable"; profile?: string }
    >
  | NamedRequest<"task", { version: string; execution: "durable" | "retryable" }>
  | NamedRequest<"job", { target: string; profile?: string }>
  | NamedRequest<
      "cache",
      {
        profile?: string;
        provider?: "redis" | "cloudflare-kv";
        source?: "docker" | "connected" | "aws";
      }
    >
  | NamedRequest<
      "bucket",
      {
        profile?: string;
        provider?: "s3" | "cloudflare-r2";
        source?: "docker" | "connected" | "aws";
      }
    >
  | NamedRequest<
      "tool",
      {
        target: string;
        createFunction?: boolean;
        sideEffect: "none" | "read" | "write" | "external";
        approval: "never" | "on-write" | "always";
      }
    >
  | NamedRequest<"prompt", { text: readonly string[] }>
  | NamedRequest<
      "agent",
      {
        model?: string;
        tools: readonly string[];
        prompt?: string;
        instructions?: string;
      }
    >
  | NamedRequest<"constants">
  | (AddRequestBase & {
      readonly kind: "route";
      readonly path: string;
      readonly mode: "route" | "service-route";
      readonly maps: Readonly<Partial<Record<RouteMethod, string>>>;
    })
  | NamedRequest<"middleware", { path: string }>
  | NamedRequest<"transform">
  | (AddRequestBase & {
      readonly kind: "database";
      readonly orm: "drizzle";
      readonly dialect: DatabaseDialect;
      readonly authSchema?: boolean;
    })
  | (AddRequestBase & {
      readonly kind: "auth";
      readonly adapter: "better-auth";
      readonly databaseDialect: DatabaseDialect;
      readonly basePath: string;
    });

/**
 * Stable warning category and user-facing message retained in plans and results.
 */
export interface ScaffoldWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * One ordered project-relative create/update operation with complete content and optional mode.
 */
export interface ScaffoldFileOperation {
  readonly path: string;
  readonly action: "create" | "update";
  readonly content: string;
  readonly mode?: number;
}

/**
 * Complete conflict-checked request, ordered writes, concrete dependencies and follow-up details.
 */
export interface ScaffoldPlan {
  readonly request: AddRequest;
  readonly projectRoot: string;
  readonly operations: readonly ScaffoldFileOperation[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly artifacts: readonly Readonly<{
    kind: string;
    path: string;
    id: string;
    binding: string;
  }>[];
  readonly profiles: readonly Readonly<{ capability: string; name: string }>[];
  readonly warnings: readonly ScaffoldWarning[];
  readonly nextSteps: readonly string[];
}

/**
 * Public result of the requested post-mutation project check.
 */
export type ScaffoldVerification =
  | { readonly status: "passed"; readonly command: string }
  | { readonly status: "skipped"; readonly reason: string; readonly command: string };

/**
 * Completed add transaction's files, packages, warnings, verification and next steps.
 */
export interface AddResult {
  readonly ok: true;
  readonly command: "add";
  readonly kind: AddKind;
  readonly projectRoot: string;
  readonly createdFiles: readonly string[];
  readonly updatedFiles: readonly string[];
  readonly installedPackages: readonly string[];
  readonly warnings: readonly ScaffoldWarning[];
  readonly verification: ScaffoldVerification;
  readonly nextSteps: readonly string[];
}

/**
 * Stable public diagnostic codes for scaffold failure categories.
 */
export const ADD_FAILURE_CODES = Object.freeze({
  usage: "RELKIT_ADD_USAGE",
  invalidProject: "RELKIT_ADD_INVALID_PROJECT",
  collision: "RELKIT_ADD_COLLISION",
  unsupportedSourceShape: "RELKIT_ADD_UNSUPPORTED_SOURCE_SHAPE",
  installation: "RELKIT_ADD_INSTALLATION_FAILED",
  validation: "RELKIT_ADD_VALIDATION_FAILED",
  cancellation: "RELKIT_ADD_CANCELLED",
} as const);

/**
 * Stable public diagnostic category of AddScaffoldError.
 */
export type AddFailureCode = (typeof ADD_FAILURE_CODES)[keyof typeof ADD_FAILURE_CODES];

/**
 * Public scaffold failure retaining its stable code, name and category-specific exit status.
 */
export class AddScaffoldError extends Error {
  readonly exitCode: 1 | 2 | 130;

  /**
   * Creates a canonical add failure with its category-specific exit code.
   * @param code - Stable add failure category.
   * @param message - User-facing failure diagnostic.
   * @returns The canonical public error instance.
   */
  constructor(
    readonly code: AddFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "AddScaffoldError";
    this.exitCode =
      code === ADD_FAILURE_CODES.usage ? 2 : code === ADD_FAILURE_CODES.cancellation ? 130 : 1;
  }
}
