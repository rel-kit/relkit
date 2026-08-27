import { defineBucket } from "@relkit/app";

const archive = defineBucket({
  id: "archive",
  profile: "missing-profile",
  visibility: "private",
});

export default archive;
