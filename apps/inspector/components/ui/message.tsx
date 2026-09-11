"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Message({
  role,
  label,
  className,
  children,
}: {
  readonly role: "user" | "assistant" | "tool";
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <article className={cn("agent-message", className)} data-role={role} aria-label={label}>
      {children}
    </article>
  );
}

export function Bubble({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-message-bubble", className)} {...props} />;
}

export function MessageScroller({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const container = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    const observer = new MutationObserver(() => {
      if (!following.current) return;
      element.scrollTo({
        top: element.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div
      {...props}
      ref={container}
      className={cn("agent-message-list", className)}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
      }}
    >
      {children}
    </div>
  );
}
