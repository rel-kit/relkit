import { defineBucket } from "@zsys/app";

const archive = defineBucket({
  id: "archive",
  profile: "missing-profile",
  visibility: "private",
});

export default archive;
