"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { Plug } from "lucide-react";
import { CodeBlock } from "../../components/blocks/code-block";
import { Section } from "../../components/blocks/section";
import { StatusBadge } from "../../components/neon/status-badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { channelFailure, channelParamsText } from "../../lib/channel-answer";
import { fieldControlClass } from "../schema-form";
import { applicationProcedure, useApplicationRuntimeClient } from "../application-runtime-client";
import {
  ChannelFrameList,
  connectionTone,
  type ChannelFrame,
  type ObservedChannelFrame,
} from "./channel-frames";

export function ChannelLiveConsole({ channel }: { readonly channel: InspectorObject }) {
  const runtime = useApplicationRuntimeClient();
  const channelId = text(channel.id);
  const [params, setParams] = useState(() => channelParamsText(channel.params));
  const [frames, setFrames] = useState<readonly ObservedChannelFrame[]>([]);
  const [checkpoint, setCheckpoint] = useState<unknown>();
  const [presence, setPresence] = useState<unknown>();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const observer = useRef<AbortController | undefined>(undefined);
  const nextFrameId = useRef(0);
  useEffect(() => () => observer.current?.abort(), []);
  useEffect(() => {
    observer.current?.abort();
    setFrames([]);
    setCheckpoint(undefined);
    setPresence(undefined);
    setStatus("idle");
  }, [runtime.identity?.identityScope, runtime.identity?.sessionEpoch]);

  function connect(event?: FormEvent, resume = false) {
    event?.preventDefault();
    if (runtime.status !== "ready") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(params);
    } catch {
      setError("Partition params must be valid JSON.");
      return;
    }
    observer.current?.abort();
    const controller = new AbortController();
    observer.current = controller;
    setStatus("connecting");
    setError("");
    void observe(parsed, controller, resume ? checkpoint : undefined);
  }

  async function observe(parsed: unknown, controller: AbortController, after?: unknown) {
    try {
      const stream = (await applicationProcedure(runtime.client, "relkit.realtime.subscribe")(
        {
          channel: channelId,
          params: parsed,
          expectedIdentity: runtime.identity,
          ...(after === undefined ? {} : { after }),
        },
        { signal: controller.signal },
      )) as AsyncIterable<ChannelFrame>;
      setStatus("live");
      for await (const frame of stream) {
        if (frame.checkpoint !== undefined) setCheckpoint(frame.checkpoint);
        if (frame.presence !== undefined) setPresence(frame.presence);
        const id = nextFrameId.current++;
        setFrames((current) => [
          ...current.slice(-49),
          { id, frame, receivedAt: new Date().toISOString() },
        ]);
        if (frame.kind === "gap") setStatus("gap");
        if (frame.kind === "caught-up") setStatus("caught-up");
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setStatus("error");
        setFrames([]);
        setCheckpoint(undefined);
        setPresence(undefined);
        setError(channelFailure(cause));
      }
    }
  }

  async function inspectPresence() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(params);
    } catch {
      setError("Partition params must be valid JSON.");
      return;
    }
    try {
      setPresence(
        await applicationProcedure(
          runtime.client,
          "relkit.realtime.presence",
        )({
          channel: channelId,
          params: parsed,
          expectedIdentity: runtime.identity,
        }),
      );
    } catch (cause) {
      setError(channelFailure(cause));
    }
  }

  function disconnect() {
    observer.current?.abort();
    observer.current = undefined;
    setStatus("idle");
  }

  if (channel.client !== "public" && channel.client !== "protected")
    return (
      <Section id="channel-live" title="Live delivery">
        <p className="m-0 text-xs text-muted-foreground">
          This channel is internal and has no browser observation endpoint.
        </p>
      </Section>
    );
  const connection = runtime.status === "ready" ? status : runtime.status;
  return (
    <Section
      aria-labelledby="channel-live-heading"
      title={<span id="channel-live-heading">Live delivery</span>}
      description="Observed through the application security boundary"
      actions={<StatusBadge tone={connectionTone(connection)} label={connection} />}
      flush
    >
      <form
        onSubmit={(event) => connect(event)}
        className="grid min-w-0 gap-3 border-b border-border p-4"
      >
        <p className="m-0 max-w-none text-xs leading-5 text-muted-foreground">
          A fresh connection starts at the live fence. Resume uses only this mounted view’s matching
          checkpoint; refresh reloads authoritative application state.
        </p>
        <label className="grid min-w-0 gap-1.5">
          <span className="font-mono text-xs font-medium text-foreground">
            Partition params (JSON)
          </span>
          <textarea
            className={cn(fieldControlClass, "h-auto min-h-16 resize-y py-2 leading-5")}
            rows={3}
            value={params}
            onChange={(event) => setParams(event.target.value)}
          />
          <small className="text-[11px] leading-4 text-muted-foreground">
            Starts from the parameters this channel declares. The Inspector connects as an anonymous
            visitor, without this browser’s cookies or a user session.
          </small>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" isDisabled={runtime.status !== "ready"}>
            <Plug aria-hidden="true" />
            Connect fresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            isDisabled={checkpoint === undefined}
            onPress={() => connect(undefined, true)}
          >
            Resume
          </Button>
          <Button variant="ghost" size="sm" onPress={disconnect}>
            Disconnect
          </Button>
          {channel.presence === undefined ? null : (
            <Button variant="ghost" size="sm" onPress={() => void inspectPresence()}>
              Inspect presence
            </Button>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
            {checkpoint === undefined ? "no checkpoint" : "checkpoint held"}
          </span>
        </div>
        {error === "" ? null : (
          <p
            className="m-0 max-w-none rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
        {presence === undefined ? null : (
          <div aria-label="Presence snapshot" role="group">
            <CodeBlock value={presence} label="presence snapshot" maxHeight="12rem" />
          </div>
        )}
      </form>
      <ChannelFrameList frames={frames} connection={connection} />
    </Section>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
