/** Checks that measurement pre-pulls exactly the pinned images of the tasks template's local services. */
import { expect, test } from "bun:test";
import { localRecipeImages } from "../../scripts/local-images.ts";

test("the tasks template's Inngest recipe images are pinned by digest", async () => {
  const images = await localRecipeImages("inngest-docker");
  expect(images.length).toBe(4);
  for (const image of images) expect(image).toMatch(/@sha256:[a-f0-9]{64}$/u);
});
