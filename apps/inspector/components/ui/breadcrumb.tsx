import { ChevronRight } from "lucide-react";

export function Breadcrumbs({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs text-[var(--muted)]">
        {items.map((item, index) => (
          <li className="flex min-w-0 items-center gap-1" key={`${item.label}:${index}`}>
            {index > 0 && <ChevronRight aria-hidden="true" className="size-3 shrink-0" />}
            {item.href ? (
              <a className="truncate hover:text-[var(--ink)]" href={item.href}>
                {item.label}
              </a>
            ) : (
              <span className="truncate text-[var(--ink)]" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
