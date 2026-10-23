/** Shared public client inference cases for emitted declarations and real packed installations. */
export const clientContractSource = `
import { oc } from "@orpc/contract";
import { createClient } from "@relkit/client";
import { createServerClient } from "@relkit/client/server";
const input = { "~standard": {
  version: 1 as const, vendor: "isolation",
  types: { input: { id: "" }, output: { id: "" } },
  validate: () => ({ value: { id: "" } })
}};
const output = { "~standard": {
  version: 1 as const, vendor: "isolation",
  types: { input: { greeting: "" }, output: { greeting: "" } },
  validate: () => ({ value: { greeting: "" } })
}};
const contract = { ping: oc.input(input).output(output) };
declare module "@relkit/client" {
  interface DefaultContractRegistry { readonly contract: typeof contract; }
}
const client = createClient({ baseUrl: "http://localhost" });
const server = createServerClient({ baseUrl: "http://localhost" });
const first: Promise<{ greeting: string }> = client.ping({ id: "one" });
const second: Promise<{ greeting: string }> = server.ping({ id: "two" });
`;

/** All three common registry misuses must preserve their native diagnostics. */
export const clientMisuseSource = `${clientContractSource}
client.ping({ id: 12 });
server.missing({});
const invalid: Promise<{ greeting: number }> = server.ping({ id: "three" });
`;

/** Query-core can hydrate a typed server client without installing React. */
export const clientQuerySource = `${clientContractSource}
import { createTanstackQueryUtils } from "@relkit/client/tanstack-query";
import { createRelkitServerContext } from "@relkit/client/server/tanstack-query";
import { QueryClient } from "@tanstack/query-core";
const utils = createTanstackQueryUtils(client);
const options = utils.ping.queryOptions({ input: { id: "one" } });
type QueryResult = Awaited<ReturnType<typeof options.queryFn>>;
const knownQueryResult: QueryResult = { greeting: "hello" };
const queryClient = new QueryClient();
const queried: Promise<{ greeting: string }> = queryClient.fetchQuery(options);
async function hydration() {
  const context = await createRelkitServerContext({
    baseUrl: "http://localhost", request: new Request("http://localhost"), queryClient,
  });
  const hydrated: Promise<{ greeting: string }> = context.client.ping({ id: "hydrated" });
  const hydratedQuery: Promise<{ greeting: string }> = queryClient.fetchQuery(
    context.utils.ping.queryOptions({ input: { id: "hydrated-query" } }),
  );
  return context.dehydrate();
}
`;

/** React explicitly selects its public provider alongside query and hydration APIs. */
export const clientReactSource = `${clientQuerySource}
import { RelkitClientProvider } from "@relkit/client/react";
const provider: typeof RelkitClientProvider = RelkitClientProvider;
`;

/** A query result retains the contract output in a deliberately invalid assignment.
 * @param source - Positive query or React source to extend.
 * @returns One additional output mismatch expected to produce TS2322.
 */
export const clientQueryMisuse = (source: string): string => `${source}
const invalid: QueryResult = { greeting: 123 };
`;

/** Finite native public import smoke constructs actual query options without making network calls. */
export const clientQueryRuntime = `
import { createClient } from "@relkit/client";
import { createServerClient } from "@relkit/client/server";
import { createTanstackQueryUtils } from "@relkit/client/tanstack-query";
import { createRelkitServerContext } from "@relkit/client/server/tanstack-query";
import { QueryClient, dehydrate } from "@tanstack/query-core";
const client = createClient({ baseUrl: "http://127.0.0.1:1" });
const server = createServerClient({ baseUrl: "http://127.0.0.1:1" });
const options = createTanstackQueryUtils(client).ping.queryOptions({ input: { id: "one" } });
if (!Array.isArray(options.queryKey) || typeof server.ping !== "function" || typeof createRelkitServerContext !== "function")
  throw new Error("Packed client query public imports are invalid");
if (!Array.isArray(dehydrate(new QueryClient()).queries)) throw new Error("Native query-core did not hydrate");
console.log("packed-client-public-imports");
`;

/** React is actually evaluated and its public provider remains callable. */
export const clientReactRuntime = `${clientQueryRuntime}
import { createElement } from "react";
import { RelkitClientProvider } from "@relkit/client/react";
if (typeof createElement !== "function" || typeof RelkitClientProvider !== "function")
  throw new Error("Packed React public imports are invalid");
`;
