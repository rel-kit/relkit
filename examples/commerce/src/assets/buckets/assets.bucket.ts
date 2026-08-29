import { defineBucket } from "@relkit/app/buckets";

const assets = defineBucket({
  id: "assets.objects",
  profile: "default",
  visibility: "private",
  maxObjectBytes: 5_000_000,
  allowedContentTypes: ["application/json", "image/*"],
});

export default assets;
