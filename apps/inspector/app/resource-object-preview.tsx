"use client";

import { Download, FileWarning, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { InspectorBucketPreview } from "../lib/api-types";
import { contentTypeConflict, isPdfContent } from "../lib/bucket-object";
import { formatTimestamp } from "../lib/format";

/** What the provider reports about an object whose content the Inspector does not render. */
export function MetadataOnly({
  value,
  reason,
}: {
  readonly value: InspectorBucketPreview;
  /** One sentence on why no content is shown. */
  readonly reason: string;
}) {
  const facts = metadataFacts(value);
  return (
    <div className="grid gap-3">
      <p className="m-0 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
        <FileWarning aria-hidden="true" className="size-4 shrink-0" />
        {reason}
      </p>
      <TypeConflict value={value} />
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        {facts.map(([name, text]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="m-0 min-w-0 font-mono break-all">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A PDF cannot be shown in a sandboxed frame, so the metadata and a download come first. */
export function PdfPreview({ value }: { readonly value: InspectorBucketPreview }) {
  const content = value.content ?? "";
  const valid = content !== "" && !value.truncated && isPdfContent(content);
  const url = useObjectUrl(content, "application/pdf");
  const file = value.key.slice(value.key.lastIndexOf("/") + 1) || "object.pdf";
  return (
    <div className="grid gap-3">
      <MetadataOnly
        value={value}
        reason={
          valid
            ? "The metadata is shown first; the PDF opens below when this browser can show it."
            : content === ""
              ? "No content was loaded for this PDF."
              : !isPdfContent(content)
                ? "This object is not a valid PDF: its content does not start with the PDF signature."
                : "Only part of this PDF was loaded, so it is not shown here."
        }
      />
      {url === undefined ? null : (
        <a
          className="text-link inline-flex w-fit items-center gap-1.5 text-xs"
          href={url}
          download={file}
        >
          <Download aria-hidden="true" className="size-3.5" />
          Download {file}
        </a>
      )}
      {valid && url !== undefined ? (
        <object
          className="min-h-[60vh] w-full rounded-md border border-border"
          data={url}
          type="application/pdf"
          aria-label={`Preview of ${value.key}`}
        >
          <p className="m-0 p-3 text-xs text-muted-foreground">
            This browser cannot show the PDF inline. Download it to open it.
          </p>
        </object>
      ) : null}
    </div>
  );
}

function TypeConflict({ value }: { readonly value: InspectorBucketPreview }) {
  const stored = typeof value.metadata.contentType === "string" ? value.metadata.contentType : "";
  const conflict = contentTypeConflict(value.key, stored);
  if (conflict === undefined) return null;
  return (
    <p className="m-0 flex items-start gap-2 text-xs text-warning" role="note">
      <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>
        The stored content type {conflict.contentType} does not match the {conflict.extension}{" "}
        extension of the key.
      </span>
    </p>
  );
}

/** Name and value pairs for the object: its size, then every scalar the provider reports. */
function metadataFacts(value: InspectorBucketPreview): readonly (readonly [string, string])[] {
  const rows: (readonly [string, string])[] = [
    ["Key", value.key],
    ["Size", `${value.totalBytes.toLocaleString("en-US")} bytes`],
  ];
  for (const [name, entry] of Object.entries(value.metadata)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")
      rows.push([
        label(name),
        name.toLowerCase().includes("modified") && typeof entry === "string"
          ? formatTimestamp(entry)
          : String(entry),
      ]);
  }
  return rows.slice(0, 12);
}

function label(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** An object URL for base64 content, released when the content changes or the view closes. */
function useObjectUrl(base64: string, type: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (base64 === "") return;
    let created: string | undefined;
    try {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      created = URL.createObjectURL(new Blob([bytes], { type }));
      setUrl(created);
    } catch {
      setUrl(undefined);
    }
    return () => {
      if (created !== undefined) URL.revokeObjectURL(created);
    };
  }, [base64, type]);
  return url;
}
