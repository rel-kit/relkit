import { getLlmText } from "../../lib/get-llm-text";
import { source } from "../../lib/source";

export const revalidate = false;

export async function GET(): Promise<Response> {
  const pages = await Promise.all(source.getPages().map(getLlmText));
  return new Response(pages.join("\n\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
