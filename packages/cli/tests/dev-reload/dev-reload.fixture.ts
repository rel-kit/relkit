/**
 * Builds a small application for the development-loop tests and drives a real `relkit dev`
 * from this checkout against it. The application has two services (`alpha` with two
 * functions, `beta` with one), one GET route per function, and handlers that return their
 * revision and the serving process ID, so a test can tell a swap from a restart. Packages
 * resolve through links to the commerce example's installed `relkit`, `zod`, `typescript`
 * and `@types/bun`. The dev process group is killed on `stop`.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { DevFixture, DevProcess, ServedRevision } from "./dev-reload.fixture.types.js";

const repository = resolve(import.meta.dir, "../../../..");
const cli = join(repository, "packages/cli/dist/bin.js");

/**
 * Emits one function module.
 * @param name - Function name.
 * @param revision - Revision text the handler returns.
 * @param extra - Statements inserted at the start of the handler body.
 * @returns Module source.
 */
export function functionSource(name: string, revision: string, extra = ""): string {
  return `import { defineFunction } from "relkit";
import { z } from "zod";

export default defineFunction({
  input: z.object({}),
  output: z.object({ message: z.string(), pid: z.number() }),
  handler: async () => {
    ${extra}
    return { message: "${name} ${revision}", pid: process.pid };
  },
});
`;
}

/**
 * Writes the application into a new temporary directory.
 * @returns The application and helpers to edit it.
 */
export function createDevFixture(): DevFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "relkit-dev-loop-")));
  const write = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write(
    "package.json",
    `${JSON.stringify({ name: "dev-loop-fixture", private: true, type: "module" })}\n`,
  );
  write("tsconfig.json", TSCONFIG);
  write("relkit.config.ts", configSource(1_048_576));
  write(
    "src/platform/env.ts",
    'import { defineEnv } from "relkit";\n\nexport default defineEnv({});\n',
  );
  for (const [service, members] of [
    ["alpha", ["a1", "a2"]],
    ["beta", ["b1"]],
  ] as const) {
    write(
      `src/services/${service}/service.ts`,
      `import { defineService } from "relkit";\n${members
        .map((name) => `import ${name} from "./functions/${name}.function.js";`)
        .join("\n")}\n\nexport default defineService({ functions: { ${members.join(", ")} } });\n`,
    );
    for (const name of members) {
      write(`src/services/${service}/functions/${name}.function.ts`, functionSource(name, "v0"));
      write(
        `src/routes/${name}/route.ts`,
        `import { defineRoute } from "relkit";\nimport ${service} from "../../services/${service}/service.js";\n\nexport const GET = defineRoute({ target: ${service}.${name} });\n`,
      );
    }
  }
  for (const name of ["relkit", "zod", "typescript", "@types/bun"]) {
    const target = join(root, "node_modules", name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(
      realpathSync(join(repository, "examples/commerce/node_modules", name)),
      target,
      "dir",
    );
  }
  return {
    root,
    write,
    read: (file) => readFileSync(join(root, file), "utf8"),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * Emits the application configuration.
 * @param maxBodyBytes - Server body limit; changing it is a configuration change.
 * @returns Module source.
 */
export function configSource(maxBodyBytes: number): string {
  return `import { defineApp } from "relkit";
import env from "./src/platform/env.js";

export default defineApp({ env, server: { port: 3000, maxBodyBytes: ${maxBodyBytes} } });
`;
}

/**
 * Starts `relkit dev` on a free port.
 * @param root - Application root.
 * @returns The running process with output and request helpers.
 */
export async function startDev(root: string): Promise<DevProcess> {
  const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = probe.port ?? 0;
  await probe.stop(true);
  const child = Bun.spawn([process.execPath, cli, "dev", "--verbose"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NO_COLOR: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  let output = "";
  const decoder = new TextDecoder();
  for (const stream of [child.stdout, child.stderr])
    void (async () => {
      for await (const chunk of stream) output += decoder.decode(chunk);
    })().catch(() => undefined);
  const get = async (path: string): Promise<ServedRevision | undefined> => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    if (response?.status !== 200) return undefined;
    return (await response.json()) as ServedRevision;
  };
  const waitFor: DevProcess["waitFor"] = async (path, message, deadlineMs = 120_000) => {
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
      const served = await get(path);
      if (served?.message === message) return served;
      await Bun.sleep(50);
    }
    throw new Error(`${path} did not serve "${message}".\n${output.slice(-6_000)}`);
  };
  const stop = async () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    await Promise.race([child.exited, Bun.sleep(15_000)]);
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  };
  return { get, waitFor, output: () => output, stop };
}

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      lib: ["ES2022"],
      types: ["bun"],
      typeRoots: ["./node_modules/@types"],
      strict: true,
      verbatimModuleSyntax: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["src/**/*.ts", "relkit.config.ts"],
  },
  null,
  2,
)}\n`;
