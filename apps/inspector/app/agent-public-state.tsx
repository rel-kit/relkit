"use client";

/*
 * The agent's public todo state as a collapsible ChainOfThought-style step list (after Neon UI
 * ChainOfThought, MIT; see public/THIRD_PARTY_NOTICES.txt). Open by default so progress is seen.
 */
import { CheckCircle2, ChevronRight, Circle, ListChecks, LoaderCircle } from "lucide-react";
import { Button, Disclosure, DisclosurePanel } from "react-aria-components";
import { cn } from "../lib/utils";

export function AgentPublicState({ values }: { readonly values: unknown }) {
  const todos = publicTodos(values);
  if (todos.length === 0) return null;
  const done = todos.filter((todo) => todo.status === "completed").length;
  const current = todos.find((todo) => todo.status === "in_progress");
  return (
    <aside className="w-full max-w-xl" aria-label="Agent todo state" aria-live="polite">
      <Disclosure defaultExpanded className="group/plan rounded-md border border-border bg-card">
        <Button
          slot="trigger"
          className="flex h-8 w-full cursor-default items-center gap-2 px-2.5 text-left outline-none hover:bg-muted/40 data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/50 data-[focus-visible]:ring-inset"
        >
          <ListChecks aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <strong className="text-xs font-medium text-foreground">Todo state</strong>
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {current ? current.content : done === todos.length ? "All steps done" : ""}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">
            {done}/{todos.length}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[expanded]/plan:rotate-90 motion-reduce:transition-none"
          />
        </Button>
        <DisclosurePanel className="border-t border-border/70">
          <ol className="relative m-0 list-none px-2.5 py-2">
            {todos.map((todo, index) => (
              <li
                key={`${todo.content}:${index}`}
                data-status={todo.status}
                className="relative flex items-start gap-2 pb-2 last:pb-0"
              >
                {index < todos.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-4 bottom-0 left-[6.5px] w-px bg-border"
                  />
                ) : null}
                <span aria-hidden="true" className="relative mt-0.5 bg-card">
                  {todo.status === "completed" ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : todo.status === "in_progress" ? (
                    <LoaderCircle className="size-3.5 text-live motion-safe:animate-spin" />
                  ) : (
                    <Circle className="size-3.5 text-muted-foreground/60" />
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-xs",
                    todo.status === "completed"
                      ? "text-muted-foreground"
                      : todo.status === "in_progress"
                        ? "font-medium text-foreground"
                        : "text-foreground/80",
                  )}
                >
                  {todo.content}
                </span>
                <small className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                  {todo.status.replace("_", " ")}
                </small>
              </li>
            ))}
          </ol>
        </DisclosurePanel>
      </Disclosure>
    </aside>
  );
}

function publicTodos(value: unknown): readonly { content: string; status: string }[] {
  if (!isRecord(value) || !Array.isArray(value.todos)) return [];
  return value.todos.flatMap((todo) =>
    isRecord(todo) && typeof todo.content === "string" && typeof todo.status === "string"
      ? [{ content: todo.content, status: todo.status }]
      : [],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
