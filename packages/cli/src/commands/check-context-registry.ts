import { join } from "node:path";
import {
  CONTEXT_REGISTRY_FILE,
  generateContextRegistry,
  writeIfChanged,
  type ExtractedDescriptor,
} from "@relkit/compiler";

export function writeContextRegistry(
  descriptors: readonly ExtractedDescriptor[],
  projectRoot: string,
  generatedDirectory: string,
): Promise<unknown> {
  return writeIfChanged(
    join(projectRoot, generatedDirectory, CONTEXT_REGISTRY_FILE),
    generateContextRegistry(descriptors, { projectRoot, generatedDirectory }),
  );
}
