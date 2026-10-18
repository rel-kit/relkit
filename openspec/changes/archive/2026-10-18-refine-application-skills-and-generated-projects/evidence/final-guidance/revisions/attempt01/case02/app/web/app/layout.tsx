import type { ReactNode } from "react";
import { Providers } from "./providers";

export default function Layout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header><a href="/">Existing workspace</a></header>
        <Providers>{children}</Providers>
        <footer>Existing fullstack wrapper</footer>
      </body>
    </html>
  );
}
