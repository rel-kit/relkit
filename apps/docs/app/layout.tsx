import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import "./landing.css";
import "./hero.css";
import "./hero-examples.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://relkit.up.railway.app"),
  title: {
    default: "Relkit — One application model for TypeScript backends",
    template: "%s | Relkit",
  },
  description:
    "Build typed TypeScript backends from one checked application graph across development, tests, HTTP, async work, inspection, and deployment.",
  // Next derives social titles and descriptions from each route's metadata.
  openGraph: {
    type: "website",
    siteName: "RELKIT",
    images: [
      {
        url: "/metadata/og.png",
        width: 1200,
        height: 630,
        alt: "RELKIT — One application model for TypeScript backends",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/metadata/og.png"],
  },
  icons: {
    icon: [
      { url: "/metadata/favicon.ico", sizes: "any" },
      { url: "/metadata/favicon.svg", type: "image/svg+xml" },
      { url: "/metadata/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/metadata/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/metadata/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/metadata/site.webmanifest",
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
