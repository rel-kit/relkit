import { defineRoute, http } from "@zsys/app";
import uploadAssets from "../../functions/upload-assets.function.js";

export const POST = defineRoute({
  target: uploadAssets,
  maxBodyBytes: 1_024,
  request: http.input({
    label: http.multipart("label"),
    primary: http.multipart("primary"),
    attachments: http.multipartAll("attachments"),
  }),
});
