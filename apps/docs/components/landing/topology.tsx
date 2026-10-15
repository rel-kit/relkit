"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { connectTopology, type TopologyStatus } from "./topology-controller";
import { TopologyFallback } from "./topology-fallback";
import styles from "./topology.module.css";

const preferenceKey = "relkit:topology-paused";

export function Topology() {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof connectTopology> | null>(null);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<TopologyStatus>("idle");

  useEffect(() => {
    if (!host.current) return;
    let saved = false;
    try {
      saved = sessionStorage.getItem(preferenceKey) === "true";
    } catch {
      /* Storage may be disabled. */
    }
    setPaused(saved);
    const connection = connectTopology(host.current, {
      paused: saved,
      onStatus: setStatus,
      load: async (element) => {
        const { createTopologyScene } = await import("./topology-scene");
        return createTopologyScene(element);
      },
    });
    controller.current = connection;
    return () => {
      connection.dispose();
      controller.current = null;
    };
  }, []);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    controller.current?.setPaused(next);
    try {
      sessionStorage.setItem(preferenceKey, String(next));
    } catch {
      /* The in-memory choice still applies. */
    }
  };

  return (
    <div className={styles.topology} data-status={status} data-paused={paused}>
      <div className={styles.legend} aria-hidden="true">
        <span>Application topology</span>
        <span>01 — 05</span>
      </div>
      <div className={styles.viewport}>
        <TopologyFallback />
        <div ref={host} className={styles.canvas} aria-hidden="true" />
      </div>
      <div className={styles.caption}>
        <span>One graph. Every connection.</span>
        {status === "ready" ? (
          <button
            onClick={toggle}
            type="button"
            aria-label={paused ? "Play topology animation" : "Pause topology animation"}
          >
            {paused ? (
              <Play size={12} aria-hidden="true" />
            ) : (
              <Pause size={12} aria-hidden="true" />
            )}
            {paused ? "Play" : "Pause"}
          </button>
        ) : (
          <span>{status === "reduced" || status === "unavailable" ? "Static view" : ""}</span>
        )}
      </div>
    </div>
  );
}
