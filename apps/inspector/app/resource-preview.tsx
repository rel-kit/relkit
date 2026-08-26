"use client";

import { useState } from "react";
import type { InspectorBucketPreview, InspectorCacheValue } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { Button } from "../components/ui/button";
import { OverlayDialog } from "../components/ui/dialog";

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
          variant="outline"
          size="sm"
          onPress={() =>
            void createInspectorClient()
              .bucketPreview(bucketId, objectKey)
              .then(setValue)
              .catch(() => setError(true))
          }
        >
          Preview
        </Button>
      }
    >
      {error ? (
        <p role="alert">Preview unavailable.</p>
      ) : value === undefined ? (
        <p role="status">Loading preview…</p>
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
          variant="outline"
          size="sm"
          onPress={() =>
            void createInspectorClient()
              .cacheValue(cacheId, cacheKey)
              .then(setValue)
              .catch(() => setError(true))
          }
        >
          View value
        </Button>
      }
    >
      {error ? (
        <p role="alert">Value unavailable or expired.</p>
      ) : value === undefined ? (
        <p role="status">Loading value…</p>
      ) : value.truncated ? (
        <MetadataOnly bytes={value.bytes} />
      ) : (
        <pre className="resource-preview-code">{JSON.stringify(value.value, null, 2)}</pre>
      )}
    </OverlayDialog>
  );
}

function Preview({ value }: { readonly value: InspectorBucketPreview }) {
  if (value.kind === "image" && value.content !== undefined) {
    const type = text(value.metadata.contentType) || "image/png";
    return (
      <img
        className="resource-preview-image"
        alt={`Preview of ${value.key}`}
        src={`data:${type};base64,${value.content}`}
      />
    );
  }
  if (value.kind === "pdf" && value.content !== undefined) {
    return (
      <iframe
        className="resource-preview-pdf"
        title={`Preview of ${value.key}`}
        sandbox=""
        src={`data:application/pdf;base64,${value.content}`}
      />
    );
  }
  if ((value.kind === "json" || value.kind === "text") && value.content !== undefined) {
    return <pre className="resource-preview-code">{value.content}</pre>;
  }
  return <MetadataOnly bytes={value.totalBytes} />;
}

function MetadataOnly({ bytes }: { readonly bytes: number }) {
  return <p>This format is metadata-only ({bytes.toLocaleString("en-US")} bytes).</p>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
