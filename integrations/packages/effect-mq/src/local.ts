import {
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  type CompositeLocalServiceRecipe,
  type LocalServiceRecipeOutputContext,
} from "@relkit/local-service";

const POSTGRES_IMAGE =
  "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685";
const BUN_IMAGE =
  "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e";

export const localRecipe = Object.freeze({
  kind: "local-service-recipe",
  protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  integrationId: "effect-mq",
  recipeId: "effect-mq-docker",
  recipeVersion: 2,
  materializerId: "docker",
  containers: Object.freeze([Object.freeze({
    id: "postgres",
    image: POSTGRES_IMAGE,
    ports: Object.freeze({}),
    volumes: Object.freeze([{ name: "postgres", mountPath: "/var/lib/postgresql/data" }]),
    environment: Object.freeze({
      POSTGRES_DB: Object.freeze({ value: "relkit" }),
      POSTGRES_USER: Object.freeze({ value: "relkit" }),
      POSTGRES_PASSWORD: Object.freeze({ secret: "postgresPassword" }),
    }),
    health: Object.freeze({
      command: ["pg_isready", "-U", "relkit", "-d", "relkit"],
      intervalMs: 250,
      timeoutMs: 2_000,
      retries: 60,
    }),
    networkAliases: Object.freeze(["postgres"]),
  })]),
  init: Object.freeze([Object.freeze({
    id: "postgres-ready",
    image: POSTGRES_IMAGE,
    dependsOn: Object.freeze(["postgres"]),
    command: Object.freeze([
      "sh",
      "-c",
      "until PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U relkit -d relkit -c 'select 1' >/dev/null 2>&1; do sleep 1; done",
    ]),
    environment: Object.freeze({ POSTGRES_PASSWORD: Object.freeze({ secret: "postgresPassword" }) }),
  })]),
  workers: Object.freeze([Object.freeze({
    id: "worker",
    image: BUN_IMAGE,
    command: Object.freeze(["bun", "run", "--no-env-file", "--no-install", "/relkit-worker/server/index.js"]),
    dependsOn: Object.freeze(["postgres-ready"]),
    ports: Object.freeze({ api: 3000 }),
    health: Object.freeze({ command: ["kill", "-0", "1"], intervalMs: 500, timeoutMs: 2_000, retries: 120 }),
    networkAliases: Object.freeze(["worker"]),
    environment: Object.freeze({
      RELKIT_EFFECT_MQ_DATABASE_URL: Object.freeze({ value: "postgres://relkit:$POSTGRES_PASSWORD@postgres:5432/relkit" }),
      RELKIT_EFFECT_MQ_MIGRATIONS: Object.freeze({ value: "owned-by-jobs-service" }),
    }),
  })]),
  volumes: Object.freeze({ postgres: Object.freeze({ mountPath: "/var/lib/postgresql/data", persistent: true }) }),
  generatedSecrets: Object.freeze({ postgresPassword: Object.freeze({ bytes: 24, encoding: "hex" }) }),
  network: Object.freeze({ internal: false }),
  ownership: Object.freeze({ scope: "project", retainVolumes: true }),
  outputs: ({ secrets }: LocalServiceRecipeOutputContext) => Object.freeze({
    postgresUrl: "postgres://relkit:" + text(secrets.postgresPassword, "postgres password") + "@127.0.0.1:5432/relkit",
    workerOrigin: "http://127.0.0.1:3000",
  }),
}) satisfies CompositeLocalServiceRecipe<"effect-mq">;

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(name + " is invalid");
  return value;
}
