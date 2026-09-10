import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";

export function AgentPublicState({ values }: { readonly values: unknown }) {
  const todos = publicTodos(values);
  if (todos.length === 0) return null;
  return (
    <aside className="agent-public-state" aria-label="Agent todo state" aria-live="polite">
      <strong>Todo state</strong>
      <ol>
        {todos.map((todo, index) => (
          <li key={`${todo.content}:${index}`} data-status={todo.status}>
            {todo.status === "completed" ? (
              <CheckCircle2 aria-hidden="true" />
            ) : todo.status === "in_progress" ? (
              <LoaderCircle aria-hidden="true" />
            ) : (
              <Circle aria-hidden="true" />
            )}
            <span>{todo.content}</span>
            <small>{todo.status.replace("_", " ")}</small>
          </li>
        ))}
      </ol>
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
