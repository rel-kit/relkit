import { join } from "node:path";
import {
  EVENT_REGISTRY_FILE,
  generateEventRegistry,
  writeIfChanged,
  type ExtractedDescriptor,
} from "@relkit/compiler";

export async function writeEventRegistry(
  descriptors: readonly ExtractedDescriptor[],
  projectRoot: string,
  generatedDirectory: string,
): Promise<void> {
  await writeIfChanged(
    join(projectRoot, generatedDirectory, EVENT_REGISTRY_FILE),
    generateEventRegistry(descriptors, { projectRoot, generatedDirectory }),
  );
}
