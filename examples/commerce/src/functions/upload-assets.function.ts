import { defineFunction } from "@zsys/app";
import { assetUploadInput, assetUploadOutput } from "../shared/schemas.js";

const uploadAssets = defineFunction({
  id: "assets.upload",
  input: assetUploadInput,
  output: assetUploadOutput,
  handler: async ({ label, primary, attachments }) => ({
    label,
    files: [primary.name, ...attachments.map(({ name }) => name)],
  }),
});

export default uploadAssets;
