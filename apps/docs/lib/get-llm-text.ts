import { source } from "./source";

export async function getLlmText(page: (typeof source)["$inferPage"]): Promise<string> {
  const markdown = await page.data.getText("processed");
  return `# ${page.data.title} (${page.url})\n\n${markdown}`;
}
