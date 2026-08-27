import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2">
          <Image src="/logo.svg" alt="" width={24} height={24} className="rounded-md" />
          Relkit
        </span>
      ),
    },
    githubUrl: "https://github.com/rel-kit/relkit",
    links: [{ text: "Examples", url: "/docs/start/create-an-app", active: "nested-url" }],
  };
}
