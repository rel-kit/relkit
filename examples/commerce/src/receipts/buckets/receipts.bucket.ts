import { defineBucket } from "@relkit/app/buckets";

const receipts = defineBucket({
  id: "receipts.objects",
  profile: "receipts",
  visibility: "private",
  maxObjectBytes: 1_000_000,
  allowedContentTypes: ["application/json"],
});

export default receipts;
