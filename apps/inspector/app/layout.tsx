import "./globals.css";
import { InspectorShell } from "./inspector-shell";

export const metadata = {
  title: "RelKit Inspector",
  description: "A read-only view of the active RelKit development generation.",
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
