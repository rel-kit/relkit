import {
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  type CompositeLocalServiceRecipe,
  type LocalServiceRecipeOutputContext,
} from "@relkit/local-service";

const TRIGGER_IMAGE =
  "triggerdotdev/trigger.dev@sha256:3563088912cf4b880602d99815ddd787274c4ce5fc77738adf1e5bad287fbd1e";
const POSTGRES_IMAGE =
  "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685";
const BUN_IMAGE =
  "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e";

export const localRecipe = Object.freeze({
  kind: "local-service-recipe",
  protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  integrationId: "trigger",
  recipeId: "trigger-docker",
  recipeVersion: 2,
  materializerId: "docker",
  containers: Object.freeze([
    Object.freeze({
      id: "postgres",
      image: POSTGRES_IMAGE,
      ports: Object.freeze({}),
      volumes: Object.freeze([{ name: "postgres", mountPath: "/var/lib/postgresql/data" }]),
      environment: Object.freeze({
        POSTGRES_DB: Object.freeze({ value: "trigger" }),
        POSTGRES_USER: Object.freeze({ value: "trigger" }),
        POSTGRES_PASSWORD: Object.freeze({ secret: "postgresPassword" }),
      }),
      health: Object.freeze({ command: ["pg_isready", "-U", "trigger", "-d", "trigger"], intervalMs: 250, timeoutMs: 2_000, retries: 60 }),
      networkAliases: Object.freeze(["postgres"]),
    }),
    Object.freeze({
      id: "trigger",
      image: TRIGGER_IMAGE,
      dependsOn: Object.freeze(["postgres-ready"]),
      ports: Object.freeze({ api: 8030 }),
      health: Object.freeze({ command: ["kill", "-0", "1"], intervalMs: 500, timeoutMs: 2_000, retries: 120 }),
      networkAliases: Object.freeze(["trigger"]),
      environment: Object.freeze({
        DATABASE_URL: Object.freeze({ value: "postgres://trigger:$POSTGRES_PASSWORD@postgres:5432/trigger" }),
        TRIGGER_ACCOUNT_FREE: Object.freeze({ value: "1" }),
        TRIGGER_PROJECT_REF: Object.freeze({ secret: "projectRef" }),
        TRIGGER_SECRET_KEY: Object.freeze({ secret: "secretKey" }),
      }),
    }),
  ]),
  init: Object.freeze([Object.freeze({
    id: "postgres-ready",
    image: POSTGRES_IMAGE,
    dependsOn: Object.freeze(["postgres"]),
    command: Object.freeze(["sh", "-c", "until PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U trigger -d trigger -c 'select 1' >/dev/null 2>&1; do sleep 1; done"]),
    environment: Object.freeze({ POSTGRES_PASSWORD: Object.freeze({ secret: "postgresPassword" }) }),
  })]),
  workers: Object.freeze([Object.freeze({
    id: "worker",
    image: BUN_IMAGE,
    command: Object.freeze(["bun", "run", "--no-env-file", "--no-install", "/relkit-worker/server/index.js"]),
    dependsOn: Object.freeze(["trigger"]),
    ports: Object.freeze({ api: 3000 }),
    health: Object.freeze({ command: ["kill", "-0", "1"], intervalMs: 500, timeoutMs: 2_000, retries: 120 }),
    networkAliases: Object.freeze(["worker"]),
  })]),
  volumes: Object.freeze({ postgres: Object.freeze({ mountPath: "/var/lib/postgresql/data", persistent: true }) }),
  generatedSecrets: Object.freeze({
    postgresPassword: Object.freeze({ bytes: 24, encoding: "hex" }),
    projectRef: Object.freeze({ bytes: 12, encoding: "hex" }),
    secretKey: Object.freeze({ bytes: 32, encoding: "hex" }),
  }),
  network: Object.freeze({ internal: false }),
  ownership: Object.freeze({ scope: "project", retainVolumes: true }),
  outputs: ({ ports, secrets }: LocalServiceRecipeOutputContext) => Object.freeze({
    baseUrl: "http://127.0.0.1:" + number(ports.api, "Trigger API port"),
    projectRef: text(secrets.projectRef, "Trigger project ref"),
    secretKey: text(secrets.secretKey, "Trigger secret key"),
  }),
}) satisfies CompositeLocalServiceRecipe<"trigger">;

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(name + " is invalid");
  return value;
}

function number(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 65_535) throw new TypeError(name + " is invalid");
  return value as number;
}
