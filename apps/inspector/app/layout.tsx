import "./globals.css";
import { InspectorShell } from "./inspector-shell";

export const metadata = {
  title: "ZSys Inspector",
  description: "A read-only view of the active ZSys development generation.",
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
