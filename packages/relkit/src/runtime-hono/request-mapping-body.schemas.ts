import { Schema } from "effect";

/** Stable public body-decoding issue categories. */
export const BodyIssueCode = Schema.Literals([
  "content-type",
  "body-too-large",
  "malformed-json",
  "malformed-multipart",
]);

/** Public validation issue returned instead of throwing for malformed request bodies. */
export const BodyIssue = Schema.Struct({ code: BodyIssueCode, message: Schema.String });
