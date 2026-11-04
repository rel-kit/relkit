/** Data that typed middleware provides to one request, read by `http.from` mappings. */
import type {
  MiddlewareContext,
  MiddlewareDescriptor,
  MiddlewareServices,
} from "../routes/index.js";

const provided = new WeakMap<Request, Readonly<Record<string, unknown>>>();

/** Adds `provide` to the services a middleware handler receives.
 * @param services - Request-scoped middleware services.
 * @param descriptor - The middleware, with its optional `provides` schema.
 * @param request - Native request the data belongs to.
 * @returns The handler's context; `provide` validates and stores the data for this request.
 * @example descriptor.handler(context, next, withProvide(services, descriptor, context.req.raw));
 */
export function withProvide(
  services: MiddlewareServices,
  descriptor: MiddlewareDescriptor<string, unknown>,
  request: Request,
): MiddlewareContext<unknown> {
  return Object.freeze({
    ...services,
    provide: async (data: unknown) => {
      const schema = descriptor.provides;
      if (schema === undefined)
        throw new TypeError("Middleware without a provides schema cannot provide data.");
      const result = await schema["~standard"].validate(data);
      if (result.issues !== undefined)
        throw new TypeError(
          `Middleware provided data that does not match its provides schema: ${result.issues
            .map((issue) => issue.message)
            .join("; ")}`,
        );
      if (result.value === null || typeof result.value !== "object")
        throw new TypeError("Middleware provides schema must describe an object.");
      provided.set(request, Object.freeze({ ...provided.get(request), ...result.value }));
    },
  });
}

/** Reads one field typed middleware provided for a request.
 * @param request - Native request.
 * @param name - Provided field.
 * @returns Whether it was provided, and its validated value.
 * @example providedValue(request, "tenantId");
 */
export function providedValue(
  request: Request,
  name: string,
): { readonly found: boolean; readonly value?: unknown } {
  const data = provided.get(request);
  return data !== undefined && Object.hasOwn(data, name)
    ? { found: true, value: data[name] }
    : { found: false };
}
