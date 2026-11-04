"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createInspectorClient } from "../../lib/client";
import {
  actionFailure,
  actionPath,
  parseJsonInput,
  postInspectorAction,
  triggeredRunId,
  type ActionIdentity,
} from "../../lib/inspector-actions";
import { Section } from "../../components/blocks/section";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { fieldControlClass, fieldTextareaClass } from "../schema-form";

/** Starts a run of one job with a JSON input, then opens the run's page. */
export function JobTrigger({
  jobId,
  identity,
}: {
  readonly jobId: string;
  readonly identity: ActionIdentity;
}) {
  const router = useRouter();
  const [input, setInput] = useState("{}");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseJsonInput(input);
    if (!parsed.ok) return setStatus(parsed.error);
    setPending(true);
    setStatus("");
    try {
      const receipt = await postInspectorAction(
        createInspectorClient(),
        actionPath("jobs", jobId, "trigger"),
        identity,
        { input: parsed.value },
      );
      const runId = triggeredRunId(receipt);
      if (runId === undefined) setStatus("The run started, but the response named no run.");
      else router.push(`/jobs/runs/${encodeURIComponent(runId)}`);
    } catch (error) {
      setStatus(actionFailure(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Section
      id="job-trigger"
      aria-labelledby="job-trigger-heading"
      title={<span id="job-trigger-heading">Trigger a run</span>}
      description="Start a run with an input; its page opens when the run is accepted"
    >
      <form className="grid gap-2" onSubmit={(event) => void submit(event)}>
        <label className="text-xs font-medium" htmlFor="job-input">
          Job input (JSON)
        </label>
        <textarea
          id="job-input"
          className={cn(fieldControlClass, fieldTextareaClass, "font-mono text-xs")}
          rows={4}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <div>
          <Button type="submit" disabled={pending}>
            Trigger job
          </Button>
        </div>
      </form>
      <p className="m-0 mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
        {status}
      </p>
    </Section>
  );
}
