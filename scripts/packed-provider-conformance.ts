/**
 * Installs the packed `@relkit/testing`, `@relkit/redis` and `@relkit/postgres` into a standalone
 * consumer from a local registry and runs the published conformance suites from the installed
 * packages, on Bun and on Node: Redis cache and realtime, Postgres jobs and events, and the local
 * bucket provider.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPackedManifest, startRegistry } from "./pack-and-smoke-create-relkit-pack.js";
import { runCommand, type Manifest } from "./pack-and-smoke-create-relkit-support.js";

const PACKAGES = ["relkit", "@relkit/testing", "@relkit/redis", "@relkit/postgres"] as const;

/**
 * Verifies the packed conformance suites against first-party providers.
 * @param tarballs - Packed RelKit artifacts.
 * @param manifests - Source identities used to validate registry artifact metadata.
 * @param services - Redis and Postgres server URLs the suites run against.
 * @returns When every suite passes on Bun and on Node.
 */
export async function verifyPackedProviderConformance(
  tarballs: Map<string, string>,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
  services: { readonly redisUrl: string; readonly postgresUrl: string; readonly node: string },
): Promise<void> {
  const dependencies: Record<string, string> = {};
  for (const name of PACKAGES) {
    const tarball = tarballs.get(name);
    if (tarball === undefined) throw new Error(`Missing packed package: ${name}`);
    dependencies[name] = String((await readPackedManifest(tarball)).version);
  }
  const fixture = await mkdtemp(join(tmpdir(), "relkit-packed-conformance-"));
  let server: Awaited<ReturnType<typeof startRegistry>> | undefined;
  let successful = false;
  try {
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify(
        { name: "relkit-packed-conformance", private: true, type: "module", dependencies },
        null,
        2,
      ) + "\n",
    );
    await writeFile(join(fixture, "conformance.mjs"), PROBE);
    server = await startRegistry(fixture, tarballs, manifests);
    const registry = `http://127.0.0.1:${server.port}`;
    await runCommand(
      ["install", "--force", "--no-cache", "--registry", registry],
      fixture,
      registry,
      join(fixture, "install-cache"),
    );
    const env = {
      ...process.env,
      REDIS_URL: services.redisUrl,
      POSTGRES_URL: services.postgresUrl,
    };
    for (const runtime of [process.execPath, services.node]) {
      const child = Bun.spawnSync([runtime, "conformance.mjs"], { cwd: fixture, env });
      const output = `${child.stdout.toString()}${child.stderr.toString()}`;
      console.log(output.trim());
      if (child.exitCode !== 0) throw new Error(`Packed conformance failed on ${runtime}`);
    }
    console.log(
      `Packed provider conformance passed (${Object.entries(dependencies)
        .map(([name, version]) => `${name}@${version}`)
        .join(", ")}).`,
    );
    successful = true;
  } finally {
    await server?.stop(true);
    if (successful) await rm(fixture, { recursive: true, force: true });
    else console.error(`Retained failed packed conformance consumer: ${fixture}`);
  }
}

/** The consumer's probe: imports only installed packages. */
const PROBE = `import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertConformance, runConformance } from "@relkit/testing/conformance";
import { createBucketsConformanceHarness } from "@relkit/testing/buckets-conformance";
import { createCacheConformanceHarness } from "@relkit/testing/cache-conformance";
import { createEventsConformanceHarness } from "@relkit/testing/events-conformance";
import { createJobsProviderConformanceHarness } from "@relkit/testing/jobs-conformance";
import { createRealtimeConformanceHarness } from "@relkit/testing/realtime-conformance";
import { createRedisCacheProvider, createRedisRealtimeProvider } from "@relkit/redis/runtime";
import { createPostgresEventProvider, createPostgresJobsRuntime } from "@relkit/postgres/runtime";
import { createLocalBucketProvider } from "relkit/providers-local";

const runtime = typeof process.versions.bun === "string" ? "bun" : "node";
const redis = process.env.REDIS_URL;
const url = process.env.POSTGRES_URL;
const service = \`packed-\${runtime}-\${Date.now()}\`;
const root = await mkdtemp(join(tmpdir(), "relkit-packed-bucket-"));
const reports = [
  ["@relkit/redis cache", createCacheConformanceHarness({
    create: (cacheId) => createRedisCacheProvider({ url: redis, cacheId }),
    failing: () => createRedisCacheProvider({ url: "redis://127.0.0.1:1", cacheId: service, connectionTimeoutMs: 500 }),
  })],
  ["@relkit/redis realtime", createRealtimeConformanceHarness({
    create: (profile) => createRedisRealtimeProvider({ url: redis, profile }),
    failing: () => createRedisRealtimeProvider({ url: "redis://127.0.0.1:1", profile: service, connectionTimeoutMs: 500 }),
  })],
  ["@relkit/postgres jobs", createJobsProviderConformanceHarness({
    create: () => createPostgresJobsRuntime({ url, service }),
    faulty: () => createPostgresJobsRuntime({ url, service, faults: { loseSubmitResponse: true } }),
  })],
  ["@relkit/postgres events", createEventsConformanceHarness({
    create: (profile) => createPostgresEventProvider({ url, profile: \`\${profile}-\${runtime}\`, consumers: false, maxConnections: 3 }),
    deliver: (provider) => provider.deliverDue(),
    failing: () => createPostgresEventProvider({ url: "postgres://relkit@127.0.0.1:1/relkit", profile: "failing", consumers: false, maxConnections: 1 }),
  })],
  ["relkit local buckets", createBucketsConformanceHarness({
    create: () => createLocalBucketProvider({ root }),
  })],
];
for (const [name, harness] of reports) {
  const report = await runConformance(harness);
  console.log(\`\${runtime} \${name}: \${report.results.map((result) => \`\${result.id}=\${result.outcome}\`).join(" ")}\`);
  assertConformance(report);
}
console.log(\`packed conformance passed on \${runtime}\`);
process.exit(0);
`;
