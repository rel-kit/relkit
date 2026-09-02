import type { Folder, Root } from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { BookOpen, Braces } from "lucide-react";
import type { ReactNode } from "react";
import { baseOptions } from "../../lib/layout.shared";
import { source } from "../../lib/source";

const tree = splitDocumentationTree(source.pageTree);

export default function DocumentationLayout({ children }: { readonly children: ReactNode }) {
  return (
    <DocsLayout tree={tree} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}

function splitDocumentationTree(sourceTree: Root): Root {
  const api = sourceTree.children.find(
    (node): node is Folder => node.type === "folder" && node.$ref?.folder === "api",
  );
  if (api === undefined) throw new Error("Documentation navigation is missing the API folder");
  return {
    ...sourceTree,
    children: [
      {
        type: "folder",
        name: "Framework",
        description: "Learn Relkit from product concepts to production.",
        icon: <BookOpen aria-hidden="true" />,
        root: true,
        children: sourceTree.children.filter((node) => node !== api),
      },
      {
        ...api,
        name: "API Reference",
        description: "Generated TypeScript APIs for core and integrations.",
        icon: <Braces aria-hidden="true" />,
        root: true,
      },
    ],
  };
}
