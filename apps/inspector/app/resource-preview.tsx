"use client";

import { useState } from "react";
import type { InspectorBucketPreview, InspectorCacheValue } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { Button } from "../components/ui/button";
import { OverlayDialog } from "../components/ui/dialog";
import { CodeBlock } from "../components/blocks/code-block";
import { LoadingRows } from "../components/blocks/block-state";
import { Eye, FileWarning } from "lucide-react";
import { MetadataOnly, PdfPreview } from "./resource-object-preview";

export function BucketPreview({
  bucketId,
  objectKey,
}: {
  readonly bucketId: string;
  readonly objectKey: string;
}) {
  const [value, setValue] = useState<InspectorBucketPreview>();
  const [error, setError] = useState(false);
  return (
    <OverlayDialog
      title={objectKey}
      description="Bounded, read-only object preview"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          onPress={() =>
            void createInspectorClient()
              .bucketPreview(bucketId, objectKey)
              .then(setValue)
              .catch(() => setError(true))
          }
        >
          <Eye aria-hidden="true" />
          Preview
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          Preview unavailable.
        </p>
      ) : value === undefined ? (
        <LoadingRows label="Loading preview…" rows={4} className="p-0" />
      ) : (
        <Preview value={value} />
      )}
    </OverlayDialog>
  );
}

export function CachePreview({
  cacheId,
  cacheKey,
}: {
  readonly cacheId: string;
  readonly cacheKey: string;
}) {
  const [value, setValue] = useState<InspectorCacheValue>();
  const [error, setError] = useState(false);
  return (
    <OverlayDialog
      title={cacheKey}
      description="Bounded, read-only cache value"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          onPress={() =>
            void createInspectorClient()
              .cacheValue(cacheId, cacheKey)
              .then(setValue)
              .catch(() => setError(true))
          }
        >
          <Eye aria-hidden="true" />
          View value
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          Value unavailable or expired.
        </p>
      ) : value === undefined ? (
        <LoadingRows label="Loading value…" rows={4} className="p-0" />
      ) : value.truncated ? (
        <TooLarge bytes={value.bytes} />
      ) : (
        <div className="grid gap-2">
          <PreviewMeta
            parts={[
              value.type,
              `${value.bytes.toLocaleString("en-US")} B`,
              value.ttlMs === null ? "no TTL" : `${value.ttlMs} ms TTL`,
            ]}
          />
          <CodeBlock value={value.value} label="cache value" maxHeight="60vh" />
        </div>
      )}
    </OverlayDialog>
  );
}

function Preview({ value }: { readonly value: InspectorBucketPreview }) {
  if (value.kind === "image" && value.content !== undefined) {
    const type = text(value.metadata.contentType) || "image/png";
    return (
      <img
        className="mx-auto block max-h-[60vh] max-w-full rounded-md border border-border bg-[repeating-conic-gradient(var(--color-muted)_0_25%,transparent_0_50%)] bg-[length:12px_12px]"
        alt={`Preview of ${value.key}`}
        src={`data:${type};base64,${value.content}`}
      />
    );
  }
  if (value.kind === "pdf") return <PdfPreview value={value} />;
  if ((value.kind === "json" || value.kind === "text") && value.content !== undefined) {
    return (
      <div className="grid gap-2">
        <PreviewMeta parts={[value.kind, `${value.totalBytes.toLocaleString("en-US")} B`]} />
        <CodeBlock value={value.content} label="object content" maxHeight="60vh" />
      </div>
    );
  }
  return (
    <MetadataOnly
      value={value}
      reason="The Inspector shows no content for this type. This is what the provider reports about the object."
    />
  );
}

function TooLarge({ bytes }: { readonly bytes: number }) {
  return (
    <p className="m-0 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-[13px] text-muted-foreground">
      <FileWarning aria-hidden="true" className="size-4 shrink-0" />
      This value is too large to show here ({bytes.toLocaleString("en-US")} bytes).
    </p>
  );
}

function PreviewMeta({ parts }: { readonly parts: readonly string[] }) {
  return (
    <p className="m-0 flex flex-wrap gap-1.5">
      {parts.map((part) => (
        <span
          key={part}
          className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] text-muted-foreground"
        >
          {part}
        </span>
      ))}
    </p>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
