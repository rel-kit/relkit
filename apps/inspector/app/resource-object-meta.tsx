import { TriangleAlert } from "lucide-react";
import type { InspectorBucketObject } from "../lib/api-types";
import { contentTypeConflict, objectFacts } from "../lib/bucket-object";
import { formatTimestamp, utcTimestamp } from "../lib/format";

/** What a bucket listing says about an object: size, content type and when it changed. */
export function BucketObjectMeta({ item }: { readonly item: InspectorBucketObject }) {
  const facts = objectFacts(item);
  const conflict = contentTypeConflict(item.key, facts.contentType);
  const parts = [
    facts.size === undefined ? "Metadata available" : `${facts.size.toLocaleString("en-US")} B`,
    facts.contentType,
  ].filter((part): part is string => part !== undefined);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
      {conflict === undefined ? null : (
        <span
          className="inline-flex items-center gap-1 text-warning"
          title={`The content type ${conflict.contentType} does not match the ${conflict.extension} extension of the key.`}
        >
          <TriangleAlert aria-hidden="true" className="size-3" />
          <span>type differs from {conflict.extension}</span>
        </span>
      )}
      <span>{parts.join(" · ")}</span>
      {facts.lastModified === undefined ? null : (
        <span>
          modified{" "}
          <time dateTime={facts.lastModified} title={utcTimestamp(facts.lastModified)}>
            {formatTimestamp(facts.lastModified)}
          </time>
        </span>
      )}
    </span>
  );
}
