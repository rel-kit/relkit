import { defineRoute } from "@relkit/app/routes";
import assets from "@app/assets/service.js";

export const POST = defineRoute({
  target: assets.uploadAssets,
  accept: "multipart/form-data",
  maxBodyBytes: 10 * 1024 * 1024,
});
