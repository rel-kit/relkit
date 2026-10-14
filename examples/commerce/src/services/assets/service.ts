/** Declares the assets service boundary without acquiring native clients. */
import { defineService } from "@relkit/app/services";
import uploadAssets from "./functions/upload-assets.function.js";

export default defineService({ functions: { uploadAssets } });
