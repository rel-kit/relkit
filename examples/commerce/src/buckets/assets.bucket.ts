import { defineBucket } from "@relkit/app";

const assets = defineBucket({
  id: "assets",
  profile: "default",
  visibility: "private",
  maxObjectBytes: 5_000_000,
  allowedContentTypes: ["application/json", "image/*"],
});

export default assets;
