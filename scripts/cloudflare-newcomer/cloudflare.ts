/**
 * The Cloudflare side of the newcomer deploy test, through a pinned wrangler: sign-in check, the
 * work queue, the deploy (which runs the project's `relkit build --runtime workers`), the database
 * secret, and deletion of the Worker and the queue. Wrangler reads `CLOUDFLARE_API_TOKEN` and
 * `CLOUDFLARE_ACCOUNT_ID` in CI, or the local `wrangler login` session.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../railway-newcomer/project.js";
import { RUNTIME_SUITE_WRANGLER } from "../runtime-http-suite.js";

/** What the flow needs from Cloudflare. */
export interface CloudflareDriver {
  authenticated(): Promise<boolean>;
  /** Names the Worker and writes its deploy files; returns the work queue's name. */
  configure(projectRoot: string, name: string): Promise<string>;
  createQueue(queue: string): Promise<void>;
  /** Deploys and returns the Worker's https origin. */
  deploy(projectRoot: string): Promise<string>;
  putSecrets(projectRoot: string, secrets: Readonly<Record<string, string>>): Promise<void>;
  /** Detaches the Worker from the queue's consumers; Cloudflare refuses to delete a consumer. */
  detachConsumer(queue: string, name: string): Promise<void>;
  deleteWorker(name: string): Promise<void>;
  deleteQueue(queue: string): Promise<void>;
}

const ENV = { WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", CI: "1" };

/**
 * Runs the pinned wrangler.
 * @param args - Wrangler arguments.
 * @param cwd - Working directory.
 * @returns Standard output.
 */
function wrangler(args: readonly string[], cwd: string): Promise<string> {
  return run([process.execPath, "x", RUNTIME_SUITE_WRANGLER, ...args], cwd, ENV);
}

/** @returns The wrangler driver. */
export function cloudflareDriver(): CloudflareDriver {
  const home = tmpdir();
  return {
    authenticated: () =>
      wrangler(["whoami"], home).then(
        (output) => !/not authenticated/iu.test(output),
        () => false,
      ),
    configure: async (projectRoot, name) => {
      const path = join(projectRoot, "package.json");
      const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      await writeFile(path, `${JSON.stringify({ ...manifest, name }, null, 2)}\n`);
      const relkit = join(projectRoot, "node_modules/.bin/relkit");
      await run([relkit, "check"], projectRoot);
      await run([relkit, "deploy", "init", "cloudflare", "--force"], projectRoot);
      await run([relkit, "check"], projectRoot);
      return `${name}-relkit-work`;
    },
    createQueue: async (queue) => void (await wrangler(["queues", "create", queue], home)),
    deploy: async (projectRoot) => {
      const output = await wrangler(["deploy"], projectRoot);
      const origin = /https:\/\/[a-z0-9.-]+\.workers\.dev/u.exec(output)?.[0];
      if (origin === undefined)
        throw new Error(`wrangler deploy printed no workers.dev URL:\n${output}`);
      return origin;
    },
    putSecrets: async (projectRoot, secrets) => {
      const directory = await mkdtemp(join(tmpdir(), "relkit-cloudflare-secrets-"));
      try {
        const file = join(directory, "secrets.json");
        await writeFile(file, JSON.stringify(secrets), { mode: 0o600 });
        await wrangler(["secret", "bulk", file], projectRoot);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    detachConsumer: async (queue, name) =>
      void (await wrangler(["queues", "consumer", "remove", queue, name], home)),
    deleteWorker: async (name) =>
      void (await wrangler(["delete", "--name", name, "--force"], home)),
    deleteQueue: async (queue) => void (await wrangler(["queues", "delete", queue], home)),
  };
}
