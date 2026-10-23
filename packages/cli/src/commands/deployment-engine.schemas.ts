/** Validates the selected deployment engine namespace before native calls. */
import { Schema } from "effect";

/** Existing Pulumi implementation signatures remain owned by the selected engine. */
export type PulumiImplementation = Pick<
  typeof import("@relkit/deploy-pulumi"),
  | "createPulumiProgram"
  | "createPulumiWorkspace"
  | "writePulumiProgram"
  | "createOutputReport"
  | "createPreviewReport"
  | "createUpdateReport"
  | "formatPulumiSummary"
  | "toPulumiLog"
  | "serializePulumiReport"
>;

const methods: readonly (keyof PulumiImplementation)[] = [
  "createPulumiProgram",
  "createPulumiWorkspace",
  "writePulumiProgram",
  "createOutputReport",
  "createPreviewReport",
  "createUpdateReport",
  "formatPulumiSummary",
  "toPulumiLog",
  "serializePulumiReport",
];

/** Native functions cannot be decoded; the versioned integration owns signatures. */
export const deploymentEngineSchema = Schema.declare<PulumiImplementation>(
  <Input>(value: Input): value is Input & PulumiImplementation =>
    typeof value === "object" &&
    value !== null &&
    methods.every((name) => name in value && typeof Reflect.get(value, name) === "function"),
);
