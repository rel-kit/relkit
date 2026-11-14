/**
 * `relkit start` on Node, which loads no dotenv file by itself, honours `PORT` and passes values
 * set only in `.env` to the built server, with `RELKIT_ENV` still defaulted to production.
 */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtCli } from "../database/fixture.js";
import { nativeStartFixture } from "./native-fixture.js";

const server = `import { createServer } from "node:http";
const server = createServer((_request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ ok: true, fromFile: process.env.FROM_FILE ?? null, relkitEnv: process.env.RELKIT_ENV, port: process.env.PORT }));
});
server.listen(Number(process.env.PORT), "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`;

test("start on Node uses PORT and values from .env", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "relkit-start-node-")));
  try {
    const directory = await nativeStartFixture(root);
    const manifestPath = join(directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, runtime: "node" }));
    await writeFile(join(directory, "server/index.js"), server);
    await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
    const port = await freePort();
    await writeFile(join(root, ".env"), `PORT=${port}\nFROM_FILE=from-dotenv\n`);
    const child = Bun.spawn(["node", builtCli, "start"], {
      cwd: root,
      env: {
        ...process.env,
        RELKIT_BUN_HANDOFF: "0",
        npm_config_user_agent: undefined,
        NODE_ENV: undefined,
        PORT: undefined,
        FROM_FILE: undefined,
        RELKIT_ENV: undefined,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const body = await poll(`http://127.0.0.1:${port}/`, child.exited);
      expect(body).toEqual({
        ok: true,
        fromFile: "from-dotenv",
        relkitEnv: "production",
        port: String(port),
      });
    } finally {
      child.kill("SIGTERM");
      await child.exited;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

/**
 * Finds a free loopback port.
 * @returns A port nothing listens on right now.
 */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => done(typeof address === "object" && address !== null ? address.port : 0));
    });
  });
}

/**
 * Fetches a URL until it answers or the process exits.
 * @param url - Server URL.
 * @param exited - Exit of the process that should serve it.
 * @returns The JSON body.
 */
async function poll(url: string, exited: Promise<number>): Promise<unknown> {
  let stopped = false;
  void exited.then(() => (stopped = true));
  for (let attempt = 0; attempt < 200 && !stopped; attempt += 1) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`${url} did not answer`);
}
