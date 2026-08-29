import { defineFunction } from "@relkit/app/functions";
import assets from "@app/assets/buckets/assets.bucket.js";
import { assetUploadInput, assetUploadOutput } from "@app/platform/schemas.js";

const uploadAssets = defineFunction({
  input: assetUploadInput,
  output: assetUploadOutput,
  dependencies: { buckets: { assets } },
  handler: async ({ label, primary, attachments }, context) => {
    const files = [primary, ...attachments];
    await Promise.all(
      files.map(async (file) =>
        context.buckets.assets.put(file.name, new Uint8Array(await file.arrayBuffer()), {
          contentType: file.type,
        }),
      ),
    );
    return { label, files: files.map(({ name }) => name) };
  },
});

export default uploadAssets;
