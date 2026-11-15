import { ACTION_SESSION_NOTE } from "../lib/session-note";

/** Says once, beside a result, that the Inspector sent the request without a user session. */
export function SessionNote({
  text = ACTION_SESSION_NOTE,
  id,
}: {
  readonly text?: string;
  readonly id?: string;
}) {
  return (
    <p id={id} className="m-0 max-w-none text-[11px] leading-4 text-muted-foreground">
      {text}
    </p>
  );
}
