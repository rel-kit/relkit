import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { InspectorShell } from "./inspector-shell";
import { THEME_BOOT_SCRIPT } from "./theme-storage";

export const metadata = {
  title: "RelKit Inspector",
  description: "A read-only view of the active RelKit development generation.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Dark is rendered on the server; this corrects it before first paint to the stored
            choice or the system's colour scheme. `suppressHydrationWarning` on <html> keeps it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <InspectorShell>{children}</InspectorShell>
      </body>
    </html>
  );
}
