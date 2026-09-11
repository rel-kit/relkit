"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { applicationProcedure, useApplicationRuntimeClient } from "../application-runtime-client";

interface ChannelFrame extends InspectorObject {
  readonly kind?: string;
  readonly checkpoint?: unknown;
  readonly presence?: unknown;
}
interface ObservedChannelFrame {
  readonly id: number;
  readonly frame: ChannelFrame;
}

export function ChannelLiveConsole({ channel }: { readonly channel: InspectorObject }) {
  const runtime = useApplicationRuntimeClient();
  const channelId = text(channel.id);
  const [params, setParams] = useState("{}");
  const [frames, setFrames] = useState<readonly ObservedChannelFrame[]>([]);
  const [checkpoint, setCheckpoint] = useState<unknown>();
  const [presence, setPresence] = useState<unknown>();
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const observer = useRef<AbortController>();
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
        setFrames((current) => [...current.slice(-49), { id, frame }]);
        if (frame.kind === "gap") setStatus("gap");
        if (frame.kind === "caught-up") setStatus("caught-up");
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setStatus("error");
        setFrames([]);
        setCheckpoint(undefined);
        setPresence(undefined);
        setError(message(cause));
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
      setError(message(cause));
    }
  }

  function disconnect() {
    observer.current?.abort();
    observer.current = undefined;
    setStatus("idle");
  }

  if (channel.client !== "public" && channel.client !== "protected")
    return (
      <section className="panel">
        <p className="supporting-copy">
          This channel is internal and has no browser observation endpoint.
        </p>
      </section>
    );
  return (
    <section className="panel composer-panel" aria-labelledby="channel-live-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">APPLICATION SECURITY BOUNDARY</p>
          <h2 id="channel-live-heading">Live delivery</h2>
        </div>
        <span className="badge">{runtime.status === "ready" ? status : runtime.status}</span>
      </div>
      <p className="supporting-copy">
        A fresh connection starts at the live fence. Resume uses only this mounted view’s matching
        checkpoint; refresh reloads authoritative application state.
      </p>
      <form onSubmit={(event) => connect(event)}>
        <label className="composer-field">
          <span>Partition params (JSON)</span>
          <textarea value={params} onChange={(event) => setParams(event.target.value)} />
        </label>
        <div>
          <button className="button-link" type="submit" disabled={runtime.status !== "ready"}>
            Connect fresh
          </button>
          <button
            className="button-link button-link--quiet"
            type="button"
            disabled={checkpoint === undefined}
            onClick={() => connect(undefined, true)}
          >
            Resume
          </button>
          <button className="button-link button-link--quiet" type="button" onClick={disconnect}>
            Disconnect
          </button>
          {channel.presence === undefined ? null : (
            <button
              className="button-link button-link--quiet"
              type="button"
              onClick={() => void inspectPresence()}
            >
              Inspect presence
            </button>
          )}
        </div>
      </form>
      {error === "" ? null : (
        <p className="field-errors" role="alert">
          {error}
        </p>
      )}
      {presence === undefined ? null : (
        <pre className="json-panel" aria-label="Presence snapshot">
          {JSON.stringify(presence, null, 2)}
        </pre>
      )}
      <ul className="request-list" aria-label="Channel frames">
        {frames.map(({ id, frame }) => (
          <li className="request-row" key={id}>
            <strong>{frame.kind ?? "frame"}</strong>
            <pre className="safe-json">{JSON.stringify(frame, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function message(value: unknown): string {
  return value instanceof Error ? value.message : "Channel operation failed.";
}
