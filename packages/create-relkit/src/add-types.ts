export const ADD_KINDS = [
  "service",
  "function",
  "error",
  "event",
  "event-function",
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

export type AddKind = (typeof ADD_KINDS)[number];
export type ServiceInclude = Exclude<
  AddKind,
  "service" | "database" | "auth" | "middleware" | "transform"
>;
export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type DatabaseDialect = "sqlite" | "postgresql" | "mysql";

export interface AddRequestBase {
  readonly projectRoot: string;
  readonly service?: string;
  readonly createService?: string;
  readonly install: boolean;
}

type NamedRequest<Kind extends AddKind, Options = object> = AddRequestBase &
  Readonly<{ kind: Kind; name: string }> &
  Readonly<Options>;

export type AddRequest =
  | NamedRequest<"service", { full: boolean; include: readonly ServiceInclude[] }>
  | NamedRequest<"function", { internal: boolean }>
  | NamedRequest<"error">
  | NamedRequest<"event", { internal: boolean; profile?: string }>
  | NamedRequest<
      "event-function",
      { event: string; delivery: "transient" | "durable"; profile?: string }
    >
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
        model: string;
        tools: readonly string[];
        prompt?: string;
        instructions?: string;
        modelProvider?: "openai" | "anthropic";
        modelId?: string;
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

export interface ScaffoldWarning {
  readonly code: string;
  readonly message: string;
}

export interface ScaffoldFileOperation {
  readonly path: string;
  readonly action: "create" | "update";
  readonly content: string;
  readonly mode?: number;
}

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

export type ScaffoldVerification =
  | { readonly status: "passed"; readonly command: string }
  | { readonly status: "skipped"; readonly reason: string; readonly command: string };

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

export const ADD_FAILURE_CODES = Object.freeze({
  usage: "RELKIT_ADD_USAGE",
  invalidProject: "RELKIT_ADD_INVALID_PROJECT",
  collision: "RELKIT_ADD_COLLISION",
  unsupportedSourceShape: "RELKIT_ADD_UNSUPPORTED_SOURCE_SHAPE",
  installation: "RELKIT_ADD_INSTALLATION_FAILED",
  validation: "RELKIT_ADD_VALIDATION_FAILED",
  cancellation: "RELKIT_ADD_CANCELLED",
} as const);

export type AddFailureCode = (typeof ADD_FAILURE_CODES)[keyof typeof ADD_FAILURE_CODES];

export class AddScaffoldError extends Error {
  readonly exitCode: 1 | 2 | 130;

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
