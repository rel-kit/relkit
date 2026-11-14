"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InspectorObject } from "../../lib/api-types";
import type { ActionAnswer } from "../../lib/action-answer";
import { checkPayload } from "../../lib/event-action-text";
import { schemaTemplate } from "../../lib/schema-model";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { ActionAnswerView } from "../action-answer-view";
import { fieldControlClass, fieldTextareaClass } from "../schema-form";
import { ActionOutcome, type ActionOutcomeState } from "./event-action-outcome";

function templateText(schema: unknown): string {
  return JSON.stringify(schemaTemplate(schema), null, 2);
}

/**
 * The payload box for publishing an event. It starts from the declared schema and checks the
 * payload against it before anything is sent; the outcome of the last publish stays below it.
 */
export function EventPublishForm({
  schema,
  busy,
  outcome,
  publications,
  onPublish,
}: {
  readonly schema: unknown;
  readonly busy: boolean;
  readonly outcome: ActionOutcomeState | undefined;
  readonly publications: readonly InspectorObject[];
  /** Called with the payload once it has passed the schema check. */
  readonly onPublish: (value: unknown) => void;
}) {
  const [payload, setPayload] = useState(() => templateText(schema));
  const [answer, setAnswer] = useState<ActionAnswer>();
  const answerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (answer !== undefined) answerRef.current?.focus();
  }, [answer]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const checked = checkPayload(payload, schema);
    setAnswer(checked.ok ? undefined : checked.answer);
    if (checked.ok) onPublish(checked.value);
  };

  return (
    <form className="grid min-w-0 gap-2" onSubmit={submit} noValidate>
      <label className="text-xs font-medium" htmlFor="event-payload">
        Event payload (JSON)
      </label>
      <textarea
        id="event-payload"
        className={cn(fieldControlClass, fieldTextareaClass, "font-mono text-xs")}
        rows={6}
        value={payload}
        aria-invalid={answer !== undefined}
        aria-describedby="event-payload-help"
        onChange={(event) => {
          setPayload(event.target.value);
          setAnswer(undefined);
        }}
      />
      <small id="event-payload-help" className="text-[11px] leading-4 text-muted-foreground">
        Starts from the event's declared schema and is checked against it before it is sent.
      </small>
      {answer === undefined ? null : <ActionAnswerView ref={answerRef} answer={answer} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" isDisabled={busy}>
          Publish event
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onPress={() => {
            setPayload(templateText(schema));
            setAnswer(undefined);
          }}
        >
          Reset to schema template
        </Button>
      </div>
      <ActionOutcome outcome={outcome} publications={publications} />
    </form>
  );
}
