import { createAuthClient } from "better-auth/client";

// Browser code: use the public backend origin, never the server secret or service.
export const authClient = createAuthClient({
  baseURL: "http://127.0.0.1:3000",
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});

export async function signIn(email: string, password: string) {
  const { data, error } = await authClient.signIn.email({ email, password });
  if (error !== null) throw new Error(error.message ?? "Sign-in failed");
  return data;
}
