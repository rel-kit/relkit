import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = { title: "Relkit Commerce", description: "Typed client acceptance app" };

export default function Layout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
