/** Calls the Echo contract from a TypeScript browser frontend without React or backend source imports. */
import { createClient } from "@relkit/client";

/** Sends one message over RPC using types from the caller's pulled contract.
 * @param baseUrl - Public backend origin, or the frontend origin when proxying RPC.
 * @param message - Nonempty message accepted by the Echo function.
 * @returns The validated message output; transport and application failures reject. */
export async function echoMessage(baseUrl: string, message: string) {
  const response = await fetch(new URL("/_relkit/v1/client/identity", baseUrl), {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Identity request failed (${response.status})`);
  const identity = await response.json();
  if (
    !identity ||
    typeof identity.identityScope !== "string" ||
    typeof identity.sessionEpoch !== "string"
  ) {
    throw new Error("The backend returned an invalid client identity");
  }
  const client = createClient({
    baseUrl,
    headers: {
      "x-relkit-identity-scope": identity.identityScope,
      "x-relkit-session-epoch": identity.sessionEpoch,
    },
  });
  return client["route.post.echo"]({ message });
}
