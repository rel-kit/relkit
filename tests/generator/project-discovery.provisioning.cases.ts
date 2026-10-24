/** Retains original provisioning assertions for project-discovery, registered by the owning suite. */
import { expect } from "bun:test";
import { discoverProject } from "../../packages/cli/src/scaffolding/index.ts";
import { withProject, write } from "./project-discovery.fixture.js";
export async function case3Provisioning() {
  await withProject(async (root) => {
    await write(
      root,
      "relkit.config.ts",
      `// @relkit/aws and @relkit/pulumi are not deployment declarations.\nexport default defineApp({});\n`,
    );
    expect((await discoverProject(root)).awsPulumiDeployment).toBeFalse();
    await write(
      root,
      "relkit.config.ts",
      `import { aws } from "@relkit/aws";\nimport { pulumi } from "@relkit/pulumi";\nexport default defineApp({ cloud: aws(), deployment: pulumi() });\n`,
    );
    expect((await discoverProject(root)).awsPulumiDeployment).toBeTrue();
  });
}
