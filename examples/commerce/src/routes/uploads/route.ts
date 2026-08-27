import { defineRoute } from "@relkit/app";
import uploadAssets from "@app/functions/upload-assets.function.js";

export const POST = defineRoute({
  target: uploadAssets,
  accept: "multipart/form-data",
  maxBodyBytes: 10 * 1024 * 1024,
});
