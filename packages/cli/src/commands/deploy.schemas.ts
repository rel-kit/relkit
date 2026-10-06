import { Schema } from "effect";

/** Supported, explicitly selected deployment mutations and reads. */
export const DEPLOY_COMMANDS = ["init", "preview", "up", "refresh", "outputs", "destroy"] as const;
/** Runtime argument boundary; commands cannot acquire arbitrary SDK authority. */
export const deployOperationSchema = Schema.Literals(DEPLOY_COMMANDS);
