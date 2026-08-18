import "./globals.css";
import { InspectorNavigation } from "./navigation";

export const metadata = {
  title: "ZSys Inspector",
  description: "A read-only view of the active ZSys development generation.",
};

export default function RootLayout({ children }: { readonly children: unknown }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="app-shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">ZSYS / DEVELOPMENT</p>
              <p className="brand">Inspector</p>
            </div>
            <p className="topbar-note">Read-only protocol view</p>
          </header>
          <div className="layout-grid">
            <aside className="sidebar">
              <InspectorNavigation />
            </aside>
            <main id="main-content" className="main-content" tabIndex={-1}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
