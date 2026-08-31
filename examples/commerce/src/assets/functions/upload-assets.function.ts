import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import assets from "@app/assets/buckets/assets.bucket.js";

const uploadedFile = z.file({
  maxBytes: 1024 * 1024 * 10,
  mediaTypes: ["image/jpeg", "image/png"],
});

const uploadAssets = defineFunction({
  input: z.object({
    label: z.string().min(1),
    primary: uploadedFile,
    attachments: z.array(uploadedFile),
  }),

  output: z.object({
    label: z.string(),
    files: z.array(z.string()),
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
