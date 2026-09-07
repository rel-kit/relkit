import type { RouteMethod } from "./add-types.js";

export function serviceRouteSource(
  domain: string,
  maps: Readonly<Partial<Record<RouteMethod, string>>>,
): string {
  const binding = domain.replace(/-([a-z0-9])/g, (_, value: string) => value.toUpperCase());
  const methods = Object.keys(maps) as RouteMethod[];
  return `import { defineServiceRoutes } from "@relkit/app/routes";
import ${binding} from "@app/${domain}/service.js";

export const { ${methods.join(", ")} } = defineServiceRoutes(${binding}, {
${methods.map((method) => `  ${method}: "${maps[method]}",`).join("\n")}
});
`;
}

export function routeSource(): string {
  return `import { defineRoute } from "@relkit/app/routes";

export const GET = defineRoute({
  handler: async () => Response.json({ ok: true }),
});
`;
}

export function middlewareSource(path: string): string {
  return `import { defineMiddleware } from "@relkit/app/routes";

export default defineMiddleware(${JSON.stringify(path)}, async (_context, next) => {
  await next();
});
`;
}

export function transformSource(): string {
  return `import { defineTransform } from "@relkit/app/routes";
import { z } from "@relkit/app/schema";

export default defineTransform({ schema: z.string() });
`;
}
