import { Schema } from "effect";
import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  type LocalServiceRecipeInput,
} from "@relkit/local-service";

const outputs = Schema.declare<LocalServiceRecipeInput["outputs"]>(
  (value): value is LocalServiceRecipeInput["outputs"] => typeof value === "function",
);
const initialize = Schema.declare<NonNullable<LocalServiceRecipeInput["initialize"]>>(
  (value): value is NonNullable<LocalServiceRecipeInput["initialize"]> =>
    typeof value === "function",
);
const secret = Schema.Struct({
  bytes: Schema.Number,
  encoding: Schema.optionalKey(Schema.Literals(["base64url", "hex"])),
});
const environment = Schema.Union([
  Schema.Struct({ secret: Schema.String }),
  Schema.Struct({ value: Schema.String }),
]);
const health = Schema.Struct({
  command: Schema.Array(Schema.String),
  intervalMs: Schema.Number,
  timeoutMs: Schema.Number,
  retries: Schema.Number,
});
const unit = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["container", "init", "worker"]),
  image: Schema.String,
  command: Schema.optionalKey(Schema.Array(Schema.String)),
  dependsOn: Schema.optionalKey(Schema.Array(Schema.String)),
  ports: Schema.optionalKey(Schema.Record(Schema.String, Schema.Number)),
  volumes: Schema.optionalKey(
    Schema.Array(Schema.Struct({ name: Schema.String, mountPath: Schema.String })),
  ),
  environment: Schema.optionalKey(Schema.Record(Schema.String, environment)),
  health: Schema.optionalKey(health),
  networkAliases: Schema.optionalKey(Schema.Array(Schema.String)),
  hostAliases: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const groupedUnit = Schema.Struct({
  ...unit.fields,
  kind: Schema.optionalKey(unit.fields.kind),
});
const common = {
  kind: Schema.Literal("local-service-recipe"),
  integrationId: Schema.String,
  recipeId: Schema.String,
  materializerId: Schema.Literal("docker"),
  outputs,
  initialize: Schema.optionalKey(initialize),
  generatedSecrets: Schema.optionalKey(Schema.Record(Schema.String, secret)),
};

/** Structural recipe boundary; the owning local-service validator checks all semantic constraints. */
export const localRecipeSchema = Schema.Union([
  Schema.Struct({
    ...common,
    protocolVersion: Schema.Literal(LOCAL_SERVICE_PROTOCOL_VERSION),
    recipeVersion: Schema.Literal(1),
    image: Schema.String,
    command: Schema.optionalKey(Schema.Array(Schema.String)),
    ports: Schema.Record(Schema.String, Schema.Number),
    volume: Schema.optionalKey(Schema.Struct({ mountPath: Schema.String })),
    health,
    environment: Schema.optionalKey(
      Schema.Record(Schema.String, Schema.Struct({ secret: Schema.String })),
    ),
  }),
  Schema.Struct({
    ...common,
    protocolVersion: Schema.Literal(LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION),
    recipeVersion: Schema.Literal(2),
    units: Schema.optionalKey(Schema.Array(unit)),
    containers: Schema.optionalKey(Schema.Array(groupedUnit)),
    init: Schema.optionalKey(Schema.Array(groupedUnit)),
    workers: Schema.optionalKey(Schema.Array(groupedUnit)),
    volumes: Schema.Record(
      Schema.String,
      Schema.Struct({ mountPath: Schema.String, persistent: Schema.optionalKey(Schema.Boolean) }),
    ),
    environment: Schema.optionalKey(Schema.Record(Schema.String, environment)),
    network: Schema.optionalKey(Schema.Struct({ internal: Schema.optionalKey(Schema.Boolean) })),
    ownership: Schema.optionalKey(
      Schema.Struct({
        scope: Schema.Literals(["project", "binding"]),
        retainVolumes: Schema.optionalKey(Schema.Boolean),
      }),
    ),
  }),
]);
