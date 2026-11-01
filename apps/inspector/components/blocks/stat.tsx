/*
 * KPI tiles, following the dashboardblocks KPI / StatGroup pattern and Neon UI MetricCard's
 * sparkline treatment (both MIT). See public/THIRD_PARTY_NOTICES.txt.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly icon?: ReactNode;
  readonly href?: string;
  readonly tone?: "default" | "success" | "warning" | "danger";
  /** Recent values for a sparkline, oldest first. */
  readonly trend?: readonly number[];
}

const toneText = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

export function Stat({ hint, href, icon, label, tone = "default", trend, value }: StatProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {icon ? (
          <span aria-hidden="true" className="[&_svg]:size-3.5">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", toneText[tone])}>
          {value}
        </span>
        {trend && trend.length > 1 ? <Sparkline values={trend} tone={tone} /> : null}
      </div>
      {hint ? <p className="m-0 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </>
  );
  const className =
    "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3.5 transition-colors";
  return href ? (
    <Link href={href} className={cn(className, "no-underline hover:border-foreground/25")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatGroup({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5", className)}>
      {children}
    </div>
  );
}

const sparkStroke = {
  default: "stroke-chart-2",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-danger",
} as const;

/** Inline SVG sparkline (replaces the recharts trend in Neon's MetricCard). */
export function Sparkline({
  values,
  tone = "default",
  width = 72,
  height = 24,
}: {
  readonly values: readonly number[];
  readonly tone?: StatProps["tone"];
  readonly width?: number;
  readonly height?: number;
}) {
  const points = sparklinePoints(values, width, height);
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="shrink-0 overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={sparkStroke[tone ?? "default"]}
      />
    </svg>
  );
}

/** Scales values into "x,y" pairs inside the box; a flat series sits on the midline. */
export function sparklinePoints(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const y = span === 0 ? height / 2 : height - ((value - min) / span) * (height - 2) - 1;
      return `${round(index * step)},${round(y)}`;
    })
    .join(" ");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
