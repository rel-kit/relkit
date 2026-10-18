"use client";

import { RelkitClientProvider } from "@relkit/client/react";
import type { ReactNode } from "react";

export function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <RelkitClientProvider baseUrl={process.env.NEXT_PUBLIC_RELKIT_API_URL ?? "http://127.0.0.1:3000"}>
      {children}
    </RelkitClientProvider>
  );
}
