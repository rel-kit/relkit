import { defineBucket } from "@relkit/app";

const archive = defineBucket({
  id: "archive.objects",
  profile: "missing-profile",
  visibility: "private",
});

export default archive;
