import { createDatabaseContext } from "./context.js";
import { drizzleRuntimeOf } from "./service.js";
import type { DatabaseContext, DrizzleServiceDescriptor } from "./types.js";

export interface DrizzleActivation<Service extends DrizzleServiceDescriptor<any, any, any, any>> {
  readonly client: Service extends DrizzleServiceDescriptor<any, infer Client, any, any>
    ? Client
    : never;
  readonly context: DatabaseContext<Service>;
  readonly close: () => Promise<void>;
}

const activations = new WeakMap<object, Promise<DrizzleActivation<any>>>();

export function activateDrizzleService<
  Service extends DrizzleServiceDescriptor<any, any, any, any>,
>(service: Service, env: Readonly<Record<string, unknown>>): Promise<DrizzleActivation<Service>> {
  const existing = activations.get(service);
  if (existing !== undefined) return existing;
  const activation = activate(service, env);
  activations.set(service, activation);
  activation.catch(() => activations.delete(service));
  return activation;
}

async function activate<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  env: Readonly<Record<string, unknown>>,
): Promise<DrizzleActivation<Service>> {
  const runtime = drizzleRuntimeOf(service);
  const client = await runtime.client({ env });
  const context = createDatabaseContext(service, runtime, client);
  let closed = false;
  const result = {
    client,
    context,
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await runtime.dispose?.(client);
    },
  };
  Object.defineProperty(result, Symbol.for("relkit.drizzle.service"), { value: service });
  return Object.freeze(result) as DrizzleActivation<Service>;
}
