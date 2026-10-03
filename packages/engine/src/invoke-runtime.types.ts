import type { MaybePromise } from "@relkit/contracts";
import type { DirectFunctionRequest } from "./dependencies.js";
import type { InvocationParent } from "./invoke-types.js";

/** Native child callback receiving the shared kernel's parent authority. */
export type DirectChildInvoker = (
  request: DirectFunctionRequest,
  parent: InvocationParent,
) => MaybePromise<unknown>;
