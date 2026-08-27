import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import "./landing.css";

export const metadata: Metadata = {
  title: {
    default: "Relkit — One application model for TypeScript backends",
    template: "%s | Relkit",
  },
  description:
    "Build typed TypeScript backends from one checked application graph across development, tests, HTTP, async work, inspection, and deployment.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ defaultTheme: "dark", enableSystem: true }}>{children}</RootProvider>
      </body>
    </html>
  );
}
