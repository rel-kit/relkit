import type { StandardSchemaV1 } from "@relkit/schema";
import type { TestRuntime } from "./runtime.js";

/** Native function-backed HTTP route and its declared exposure/validation contract. */
export type TestFunctionRoute = {
  readonly method: string;
  readonly path: string;
  readonly request: unknown;
  readonly target: Parameters<TestRuntime["invoke"]>[0] & {
    readonly input: StandardSchemaV1;
    readonly output: StandardSchemaV1;
    readonly errors?: readonly {
      readonly id: string;
      readonly data: StandardSchemaV1;
      readonly http?: { readonly status: number };
    }[];
  };
  readonly responses: readonly {
    readonly kind?: string;
    readonly id?: string;
    readonly status?: number;
    readonly errorId?: string;
  }[];
};

/** Raw native HTTP route preserving its original handler and method contract. */
export type TestRawRoute = {
  readonly method: "ALL";
  readonly path: string;
  readonly handler: (request: Request) => Response | Promise<Response>;
  readonly auth?: { readonly protected: readonly string[] };
};

/** Supported native function or raw HTTP route declaration. */
export type TestRoute = TestFunctionRoute | TestRawRoute;

/** Native authored route descriptor accepted by application HTTP wiring. */
export type AuthoredRoute = Omit<TestFunctionRoute, "method" | "path" | "request" | "responses"> & {
  readonly accept?: "application/json" | "multipart/form-data";
  readonly request?: unknown;
  readonly responses?: TestFunctionRoute["responses"];
  readonly successStatus?: number;
};
