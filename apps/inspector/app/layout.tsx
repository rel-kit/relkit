import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { InspectorShell } from "./inspector-shell";
import { INSPECTOR_THEME_KEY } from "./theme-storage";

export const metadata = {
  title: "RelKit Inspector",
  description: "A read-only view of the active RelKit development generation.",
  icons: { icon: "/logo.svg" },
};

// Dark is rendered on the server; this runs before first paint so a stored light preference
// never flashes dark (and the default never flashes light).
const applyStoredTheme = `try{var t=localStorage.getItem(${JSON.stringify(INSPECTOR_THEME_KEY)});if(t==="light"){var d=document.documentElement;d.dataset.theme="light";d.classList.remove("dark")}}catch(e){}`;

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />
      </head>
      <body>
        <InspectorShell>{children}</InspectorShell>
      </body>
    </html>
  );
}
