"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { connectLandingMotion, type LandingMotionState } from "./motion-controller";
import styles from "./landing-motion.module.css";

export function MotionRegion({
  children,
  className,
  name,
}: {
  readonly children: ReactNode;
  readonly className: string | undefined;
  readonly name: "connections" | "technology";
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof connectLandingMotion>>(null);
  const [state, setState] = useState<LandingMotionState>({
    paused: false,
    reduced: false,
    running: false,
  });
  useEffect(() => {
    if (!host.current) return;
    const connected = connectLandingMotion(host.current, `relkit:${name}-paused`, setState);
    controller.current = connected;
    return () => {
      connected.dispose();
      controller.current = null;
    };
  }, [name]);
  return (
    <div
      ref={host}
      className={`${styles.region} ${className ?? ""}`}
      data-motion={state.running ? "running" : "paused"}
      data-reduced={state.reduced}
    >
      {children}
      <button
        type="button"
        className={styles.control}
        onClick={() => controller.current?.toggle()}
        disabled={state.reduced}
        aria-pressed={state.paused}
        aria-label={`${state.paused ? "Play" : "Pause"} ${name} animation`}
        title={
          state.reduced ? "Reduced motion enabled" : `${state.paused ? "Play" : "Pause"} animation`
        }
      >
        {state.paused ? (
          <Play size={14} aria-hidden="true" />
        ) : (
          <Pause size={14} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
