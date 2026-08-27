import { createClient } from "@relkit/client";

export const bearerHeaders = new Headers();
export const client = createClient({ baseUrl: "http://127.0.0.1:3000", headers: bearerHeaders });

export function setBearerToken(token?: string): void {
  if (token === undefined) bearerHeaders.delete("authorization");
  else bearerHeaders.set("authorization", `Bearer ${token}`);
}
