import type { RouteMethod } from "./add-types.js";

/**
 * Renders service Route Source as source text without executing user modules.
 * @param domain - Normalized owning domain used by source imports and job names.
 * @param maps - HTTP method-to-service-member mappings.
 * @returns Service-route source exporting handlers for the declared HTTP method mappings.
 */
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

/**
 * Renders route Source as source text without executing user modules.
 * @returns Route source with an example GET JSON response.
 */
export function routeSource(): string {
  return `import { defineRoute } from "@relkit/app/routes";

export const GET = defineRoute({
  handler: async () => Response.json({ ok: true }),
});
`;
}

/**
 * Renders middleware Source as source text without executing user modules.
 * @param path - Requested middleware match path.
 * @returns Middleware source matching the selected path and forwarding to the next handler.
 */
export function middlewareSource(path: string): string {
  return `import { defineMiddleware } from "@relkit/app/routes";

export default defineMiddleware(${JSON.stringify(path)}, async (_context, next) => {
  await next();
});
`;
}

/**
 * Renders transform Source as source text without executing user modules.
 * @returns Transform descriptor source with an example string schema.
 */
export function transformSource(): string {
  return `import { defineTransform } from "@relkit/app/routes";
import { z } from "@relkit/app/schema";

export default defineTransform({ schema: z.string() });
`;
}
