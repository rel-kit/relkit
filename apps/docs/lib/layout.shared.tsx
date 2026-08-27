import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: "RELKIT" },
    githubUrl: "https://github.com/rel-kit/relkit",
    links: [{ text: "Examples", url: "/docs/start/create-an-app", active: "nested-url" }],
  };
}
