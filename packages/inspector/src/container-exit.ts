/** A joined requested shutdown is healthy; mixed failures retain normal failure exit codes. */
import { Cause, Exit, Runtime } from "effect";

export const inspectorContainerTeardown: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return onExit(0);
  Runtime.defaultTeardown(exit, onExit);
};
