import { defineBucket } from "@relkit/app";

const assets = defineBucket({
  id: "assets",
  profile: "default",
  visibility: "private",
  maxObjectBytes: 10_000,
  allowedContentTypes: ["application/json"],
});

export default assets;
