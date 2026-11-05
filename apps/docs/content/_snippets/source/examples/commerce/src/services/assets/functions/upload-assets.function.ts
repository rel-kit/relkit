/** Validates multipart image files, writes them through the declared assets bucket and returns their uploaded names. */
import { defineFunction } from "relkit/functions";
import { s } from "relkit/schema";
import assets from "../buckets/assets.bucket.js";

const uploadedFile = s.file({
  maxBytes: 1024 * 1024 * 10,
  mediaTypes: ["image/jpeg", "image/png"],
});

const uploadAssets = defineFunction({
  input: s.object({
    label: s.string().min(1),
    primary: uploadedFile,
    attachments: s.array(uploadedFile),
  }),

  output: s.object({
    label: s.string(),
    files: s.array(s.string()),
  }),

  dependencies: { buckets: { assets } },

  handler: async ({ label, primary, attachments }, context) => {
    const files = [primary, ...attachments];

    // This demo uses filenames as keys; uploading the same name replaces the file.
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
