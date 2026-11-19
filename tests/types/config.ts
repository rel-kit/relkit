import * as appExports from "relkit";
import { type ApplicationProfilesOf, defineApp, defineEnv, env } from "relkit/config";
import type { ProviderProfileName } from "relkit/contracts";
import { kv, r2 } from "@relkit/cloudflare";
import { docker } from "@relkit/docker";
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
} from "relkit/provider";
import { redis } from "@relkit/redis";
import { s3 } from "@relkit/s3";

const nativeModel = defineProviderAdapter({
  integration: defineIntegrationReference("test-model"),
  capability: defineProviderCapability("model"),
  adapterId: "native-model",
  connectionContract: defineConnectionContract({}),
  connection: {},
  behavior: defineProviderBehavior({ defaultModel: "test-model" }),
});

defineApp({
  env: defineEnv({}),
  server: {
    port: 3000,
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false },
  },
  inspector: { enabled: true, connection: { host: "127.0.0.1", port: 0 } },
});

defineApp({ env: defineEnv({}), inspector: { enabled: false } });
defineApp({
  env: defineEnv({}),
  // @ts-expect-error the standalone UI port is not application configuration
  inspector: { port: 3210 },
});

const namedUrl = env.secret("CACHE_URL");
const timelineUrl = env.secret("TIMELINE_CACHE_URL");
const namedUrlName: "CACHE_URL" = namedUrl.name;
void namedUrlName;

const unified = defineApp({
  env: defineEnv({}),
  cache: {
    requests: redis({ url: namedUrl }),
    timeline: redis({ url: timelineUrl }),
  },
  defaults: { cache: "requests" },
});
const cacheDefault: "requests" | "timeline" | undefined = unified.defaults.cache;
const adapterId: "redis" = unified.cache.profiles.requests!.adapter.adapterId;
void cacheDefault;
void adapterId;

const localRedis = docker(redis());
defineApp({ env: defineEnv({}), cache: localRedis });
// @ts-expect-error source wrappers cannot be nested
docker(localRedis);

defineApp({
  env: defineEnv({}),
  model: nativeModel,
  cache: kv({
    accountId: env.string("CLOUDFLARE_ACCOUNT_ID"),
    namespaceId: env.string("CLOUDFLARE_KV_NAMESPACE_ID"),
    apiToken: env.secret("CLOUDFLARE_API_TOKEN"),
  }),
  bucket: r2({
    accountId: env.string("CLOUDFLARE_ACCOUNT_ID"),
    bucketName: "assets",
    credentials: {
      accessKeyId: env.secret("R2_ACCESS_KEY_ID"),
      secretAccessKey: env.secret("R2_SECRET_ACCESS_KEY"),
    },
  }),
});

const assets = s3({
  endpoint: env.url("S3_ENDPOINT"),
  bucketName: env.string("S3_BUCKET"),
  region: "auto",
  credentials: {
    accessKeyId: env.secret("S3_ACCESS_KEY_ID"),
    secretAccessKey: env.secret("S3_SECRET_ACCESS_KEY"),
  },
  forcePathStyle: true,
});
defineApp({ env: defineEnv({}), bucket: assets });
s3({ signedUrlTtlSeconds: 900 });

s3({
  credentials: {
    // @ts-expect-error S3 credentials require named secret binding values
    accessKeyId: env.string("S3_ACCESS_KEY_ID"),
    secretAccessKey: env.secret("S3_SECRET_ACCESS_KEY"),
  },
});

defineApp({
  env: defineEnv({}),
  cache: { requests: redis({ url: namedUrl }) },
  // @ts-expect-error defaults reference keys in the corresponding singular map
  defaults: { cache: "missing" },
});

// A single adapter is the profile `default`.
const single = defineApp({
  env: defineEnv({}),
  cache: redis({ url: namedUrl }),
  defaults: { cache: "default" },
});
const singleDefault: "default" | undefined = single.defaults.cache;
void singleDefault;

// The generated registry reads the profile names of each capability from the descriptor's type.
type UnifiedProfiles = ApplicationProfilesOf<typeof unified>;
const namedProfiles: UnifiedProfiles["cache"][] = ["requests", "timeline"];
// @ts-expect-error not a profile of the cache capability
const unknownProfile: UnifiedProfiles["cache"] = "missing";
const soleProfile: ApplicationProfilesOf<typeof single>["cache"] = "default";
void [namedProfiles, unknownProfile, soleProfile];
// Without names in the registry, as in a library, a descriptor's profile is any string.
const freeProfile: string extends ProviderProfileName<"bucket"> ? true : false = true;
void freeProfile;

defineApp({
  env: defineEnv({}),
  cache: redis({ url: namedUrl }),
  // @ts-expect-error a single adapter has no profile other than default
  defaults: { cache: "requests" },
});

defineApp({
  env: defineEnv({}),
  cache: { requests: redis({ url: namedUrl }) },
  // @ts-expect-error a default needs a provider for its capability
  defaults: { bucket: "assets" },
});

// One wrong default does not make the correct ones errors.
defineApp({
  env: defineEnv({}),
  cache: { requests: redis({ url: namedUrl }) },
  bucket: assets,
  defaults: {
    bucket: "default",
    // @ts-expect-error only this entry names a profile that does not exist
    cache: "missing",
  },
});

defineApp({
  env: defineEnv({}),
  cache: { requests: redis({ url: namedUrl }) },
  // @ts-expect-error an unknown option is rejected beside a real provider
  caches: {},
});

defineApp({
  env: defineEnv({}),
  // @ts-expect-error plural capability keys were removed
  caches: { requests: redis({ url: namedUrl }) },
});

defineApp({
  env: defineEnv({}),
  // @ts-expect-error provider maps are singular top-level capability inputs
  providers: {},
});

// @ts-expect-error named binding refs cannot declare handler-visible environment fields
defineEnv({ CACHE_URL: env.secret("CACHE_URL") });

const applicationEnv = defineEnv({ CACHE_URL: env.secret() });
// @ts-expect-error handler environment refs cannot satisfy binding-local connection fields
redis({ url: applicationEnv.CACHE_URL });

// @ts-expect-error PORT belongs to framework server configuration
defineEnv({ PORT: env.port() });

// @ts-expect-error source discovery is fixed by convention
defineApp({ env: defineEnv({}), source: ["lib/**/*.ts"] });

defineApp({
  env: defineEnv({}),
  server: {
    // @ts-expect-error server settings are closed
    host: "127.0.0.1",
  },
});

// @ts-expect-error defineConfig was removed instead of aliased
void appExports.defineConfig;
// @ts-expect-error ownership wrappers were removed
void appExports.external;
// @ts-expect-error ownership wrappers were removed
void appExports.managed;
// @ts-expect-error integration constructors are not forwarded by @relkit/app
void appExports.redis;
// @ts-expect-error speculative source aliases do not exist
void appExports.connect;
// @ts-expect-error speculative source aliases do not exist
void appExports.connection;
// @ts-expect-error speculative source aliases do not exist
void appExports.provision;
