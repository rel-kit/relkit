import {
  LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  type CompositeLocalServiceRecipe,
  type LocalServiceRecipeOutputContext,
} from "@relkit/local-service";
import { waitForInngestReadiness } from "./local-readiness.js";

const INNGEST_IMAGE =
  "inngest/inngest@sha256:d5365a31f8bf504dc2d54ddd114fcdc1a0413f8b57a450365c095ab6234ad8c2";
const POSTGRES_IMAGE =
  "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685";
const REDIS_IMAGE =
  "redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf";
const BUN_IMAGE =
  "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e";

export const localRecipe = Object.freeze({
  kind: "local-service-recipe",
  protocolVersion: LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION,
  integrationId: "inngest",
  recipeId: "inngest-docker",
  recipeVersion: 2,
  materializerId: "docker",
  containers: Object.freeze([
    Object.freeze({
      id: "postgres",
      image: POSTGRES_IMAGE,
      ports: Object.freeze({}),
      volumes: Object.freeze([{ name: "postgres", mountPath: "/var/lib/postgresql/data" }]),
      environment: Object.freeze({
        POSTGRES_DB: Object.freeze({ value: "inngest" }),
        POSTGRES_USER: Object.freeze({ value: "inngest" }),
        POSTGRES_PASSWORD: Object.freeze({ secret: "postgresPassword" }),
      }),
      health: Object.freeze({
        command: ["pg_isready", "-U", "inngest", "-d", "inngest"],
        intervalMs: 250,
        timeoutMs: 2_000,
        retries: 60,
      }),
      networkAliases: Object.freeze(["postgres"]),
    }),
    Object.freeze({
      id: "redis",
      image: REDIS_IMAGE,
      command: Object.freeze(["redis-server", "--appendonly", "yes", "--appendfsync", "always"]),
      ports: Object.freeze({}),
      volumes: Object.freeze([{ name: "redis", mountPath: "/data" }]),
      health: Object.freeze({
        command: ["redis-cli", "ping"],
        intervalMs: 250,
        timeoutMs: 2_000,
        retries: 60,
      }),
      networkAliases: Object.freeze(["redis"]),
    }),
    Object.freeze({
      id: "inngest",
      image: INNGEST_IMAGE,
      command: Object.freeze([
        "sh",
        "-c",
        'exec inngest start --host 0.0.0.0 --port 8288 --event-key "$INNGEST_EVENT_KEY" --signing-key "$INNGEST_SIGNING_KEY" --postgres-uri "postgres://inngest:$POSTGRES_PASSWORD@postgres:5432/inngest" --redis-uri redis://redis:6379 --sdk-url "${INNGEST_SDK_URL:-http://worker:3000/api/inngest}" --poll-interval 1 --retry-interval 1 --queue-workers 10',
      ]),
      dependsOn: Object.freeze(["postgres-ready", "redis"]),
      ports: Object.freeze({ api: 8288 }),
      health: Object.freeze({
        command: ["kill", "-0", "1"],
        intervalMs: 500,
        timeoutMs: 2_000,
        retries: 60,
      }),
      networkAliases: Object.freeze(["inngest"]),
      hostAliases: Object.freeze({ "host.docker.internal": "host-gateway" }),
      environment: Object.freeze({
        INNGEST_EVENT_KEY: Object.freeze({ secret: "eventKey" }),
        INNGEST_SIGNING_KEY: Object.freeze({ secret: "signingKey" }),
        POSTGRES_PASSWORD: Object.freeze({ secret: "postgresPassword" }),
      }),
    }),
  ]),
  workers: Object.freeze([
    Object.freeze({
      id: "worker",
      image: BUN_IMAGE,
      command: Object.freeze([
        "bun",
        "run",
        "--no-env-file",
        "--no-install",
        "/relkit-worker/server/index.js",
      ]),
      dependsOn: Object.freeze(["inngest"]),
      ports: Object.freeze({ api: 3000 }),
      health: Object.freeze({
        command: ["kill", "-0", "1"],
        intervalMs: 500,
        timeoutMs: 2_000,
        retries: 120,
      }),
      networkAliases: Object.freeze(["worker"]),
    }),
  ]),
  init: Object.freeze([
    Object.freeze({
      id: "postgres-ready",
      image: POSTGRES_IMAGE,
      dependsOn: Object.freeze(["postgres"]),
      command: Object.freeze([
        "sh",
        "-c",
        "until PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U inngest -d inngest -c 'select 1' >/dev/null 2>&1; do sleep 1; done",
      ]),
      environment: Object.freeze({
        POSTGRES_PASSWORD: Object.freeze({ secret: "postgresPassword" }),
      }),
    }),
  ]),
  volumes: Object.freeze({
    postgres: Object.freeze({ mountPath: "/var/lib/postgresql/data", persistent: true }),
    redis: Object.freeze({ mountPath: "/data", persistent: true }),
  }),
  generatedSecrets: Object.freeze({
    eventKey: Object.freeze({ bytes: 24, encoding: "hex" }),
    signingKey: Object.freeze({ bytes: 32, encoding: "hex" }),
    postgresPassword: Object.freeze({ bytes: 24, encoding: "hex" }),
  }),
  network: Object.freeze({ internal: false }),
  ownership: Object.freeze({ scope: "project", retainVolumes: true }),
  outputs: ({ ports, secrets, endpoints }: LocalServiceRecipeOutputContext) =>
    Object.freeze({
      baseUrl: `http://127.0.0.1:${number(ports.api, "Inngest API port")}`,
      eventKey: text(secrets.eventKey, "event key"),
      signingKey: text(secrets.signingKey, "signing key"),
      serveOrigin: endpoints?.serveOrigin ?? "http://host.docker.internal:3000",
    }),
  initialize: waitForInngestReadiness,
}) satisfies CompositeLocalServiceRecipe<"inngest">;

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 65_535)
    throw new TypeError(`${name} is invalid`);
  return value;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(`${name} is invalid`);
  return value;
}
