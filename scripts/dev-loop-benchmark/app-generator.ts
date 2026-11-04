/**
 * Writes the generated benchmark applications used by the development-loop benchmark.
 * Each application has `functions` function descriptors spread over services of ten,
 * one GET route per function, and a `node_modules` made of links to the workspace's
 * installed `relkit`, `@relkit/cli`, `zod`, `typescript` and `@types/bun`, so the app
 * resolves exactly the packages of the checkout under test. Writing is synchronous and
 * idempotent: an existing application directory is replaced.
 */
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BenchmarkApp } from "./benchmark.types.js";

/** Packages linked into every generated application, resolved from the commerce example. */
const LINKED_PACKAGES = ["relkit", "@relkit/cli", "zod", "typescript", "@types/bun"] as const;

/** Functions per generated service; a 500-function app has 50 services. */
const SERVICE_SIZE = 10;

/**
 * Generates one benchmark application.
 * @param repositoryRoot - Checkout whose packages the application links.
 * @param appsRoot - Directory that receives `functions-<n>`.
 * @param functions - Number of function descriptors and routes.
 * @returns The application root and the handler file the reload benchmark edits.
 */
export function generateBenchmarkApp(
  repositoryRoot: string,
  appsRoot: string,
  functions: number,
): BenchmarkApp {
  const root = join(appsRoot, `functions-${functions}`);
  rmSync(root, { recursive: true, force: true });
  const write = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write("package.json", packageJson(functions));
  write("tsconfig.json", TSCONFIG);
  write("relkit.config.ts", CONFIG);
  write("src/platform/env.ts", ENV);
  for (let service = 0; service * SERVICE_SIZE < functions; service += 1) {
    const members = Array.from(
      { length: Math.min(SERVICE_SIZE, functions - service * SERVICE_SIZE) },
      (_, offset) => service * SERVICE_SIZE + offset,
    );
    write(`src/services/s${service}/service.ts`, serviceSource(service, members));
    for (const index of members) {
      write(functionFile(index), functionSource(index, "v0"));
      write(`src/routes/f${index}/route.ts`, routeSource(index));
    }
  }
  linkPackages(repositoryRoot, root);
  return { root, functions, editedFile: functionFile(0), route: "/f0" };
}

/**
 * Names the handler module of one function.
 * @param index - Function number.
 * @returns Project-relative module path.
 */
export function functionFile(index: number): string {
  return `src/services/s${Math.floor(index / SERVICE_SIZE)}/functions/f${index}.function.ts`;
}

/**
 * Emits a function module whose handler returns a recognizable revision.
 * @param index - Function number.
 * @param revision - Text the handler returns; the benchmark waits for it after a save.
 * @returns Module source.
 */
export function functionSource(index: number, revision: string): string {
  return `import { defineFunction } from "relkit";
import { z } from "zod";

export default defineFunction({
  input: z.object({}),
  output: z.object({ message: z.string() }),
  handler: async () => ({ message: "f${index} ${revision}" }),
});
`;
}

/**
 * Emits one service that groups ten functions.
 * @param service - Service number.
 * @param members - Function numbers owned by the service.
 * @returns Module source.
 */
function serviceSource(service: number, members: readonly number[]): string {
  const imports = members
    .map(
      (index) =>
        `import f${index} from "@app/services/s${service}/functions/f${index}.function.js";`,
    )
    .join("\n");
  return `import { defineService } from "relkit";
${imports}

export default defineService({ functions: { ${members.map((index) => `f${index}`).join(", ")} } });
`;
}

/**
 * Emits the GET route that targets one function.
 * @param index - Function number.
 * @returns Module source.
 */
function routeSource(index: number): string {
  const service = Math.floor(index / SERVICE_SIZE);
  return `import { defineRoute } from "relkit";
import s${service} from "@app/services/s${service}/service.js";

export const GET = defineRoute({ target: s${service}.f${index} });
`;
}

/**
 * Emits the package manifest; the name carries the size so graph IDs differ per app.
 * @param functions - Function count.
 * @returns JSON text.
 */
function packageJson(functions: number): string {
  return `${JSON.stringify(
    { name: `dev-loop-bench-${functions}`, private: true, type: "module" },
    null,
    2,
  )}\n`;
}

/**
 * Links the workspace's installed packages into the application.
 * @param repositoryRoot - Checkout whose commerce example has the packages installed.
 * @param root - Generated application root.
 */
function linkPackages(repositoryRoot: string, root: string): void {
  const source = join(repositoryRoot, "examples/commerce/node_modules");
  for (const name of LINKED_PACKAGES) {
    const target = join(root, "node_modules", name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(realpathSync(join(source, name)), target, "dir");
  }
}

const CONFIG = `import { defineApp } from "relkit";
import env from "@app/platform/env.js";

export default defineApp({ env, server: { port: 3000 } });
`;

const ENV = `import { defineEnv } from "relkit";

export default defineEnv({});
`;

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      baseUrl: ".",
      paths: { "@app/*": ["src/*"] },
      lib: ["ES2022"],
      types: ["bun"],
      typeRoots: ["./node_modules/@types"],
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["src/**/*.ts", "relkit.config.ts"],
    exclude: ["node_modules", ".relkit"],
  },
  null,
  2,
)}\n`;
