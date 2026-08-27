import "./globals.css";
import { InspectorShell } from "./inspector-shell";

export const metadata = {
  title: "RELKIT Inspector",
  description: "A read-only view of the active RELKIT development generation.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { readonly children: unknown }) {
  return (
    <html lang="en">
      <body>
        <InspectorShell>{children}</InspectorShell>
      </body>
    </html>
  );
}
