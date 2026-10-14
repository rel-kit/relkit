/** Admits bounded multipart upload requests to the assets service's validated image handler. */
import { defineRoute } from "@relkit/app/routes";
import assets from "../../services/assets/service.js";

export const POST = defineRoute({
  target: assets.uploadAssets,
  accept: "multipart/form-data",
  maxBodyBytes: 10 * 1024 * 1024,
});
