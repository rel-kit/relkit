"use client";

/** Connects the native browser session hook to RELKIT's identity-scoped client cache. */
import { BetterAuthRelkitClientProvider } from "@relkit/better-auth/react";
import { createAuthClient } from "better-auth/react";
import type { ReactNode } from "react";

export const authClient = createAuthClient({ basePath: "/api/auth" });

/** Remounts private client state when the browser's authenticated session changes.
 * @param props - Frontend content that consumes RELKIT hooks.
 * @returns A same-origin provider whose auth endpoints use the native Better Auth client. */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  return (
    <BetterAuthRelkitClientProvider authClient={authClient}>
      {children}
    </BetterAuthRelkitClientProvider>
  );
}
