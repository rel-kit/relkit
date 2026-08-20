import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: "ZSYS" },
    githubUrl: "https://github.com/zsys-dev/zsys",
    links: [{ text: "Examples", url: "/docs/start/create-an-app", active: "nested-url" }],
  };
}
