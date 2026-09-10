export interface BrowserAcceptanceDriver {
  readonly baseUrl: string;
  readonly run: (...args: string[]) => Promise<string>;
  readonly snapshot: () => Promise<string>;
  readonly reference: (tree: string, label: string) => string;
  readonly includes: (value: string, expected: string) => void;
}

export async function runAgentGraphAcceptance(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("open", `${baseUrl}/agents/support.order/chat`);
  await run("wait", "--text", "Start a conversation");
  let tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Message the agent"'), "Review the order");
  await run("press", "Enter");
  await run("wait", "--text", "Human input required");
  await run("wait", "--text", "Look up the order");
  await run("wait", "--text", "orders.get.tool");
  includes(
    await run("eval", "document.body.innerText.includes('The order was rejected.')"),
    "false",
  );
  includes(await run("eval", "document.querySelector('[aria-live=polite]') !== null"), "true");
  const chatUrl = await run("get", "url");
  const threadId = new URL(chatUrl).searchParams.get("thread");
  if (threadId === null) throw new Error("Agent run did not expose its caller-owned thread ID.");

  tree = await snapshot();
  await run("select", reference(tree, 'combobox "Decision"'), "false");
  await run("click", reference(await snapshot(), 'button "Resume"'));
  await run("wait", "--text", "The order was rejected.");
  await run("wait", "--text", "completed");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Thread history"'));
  await run("wait", "--text", "Review the order");
  await run("press", "Escape");
  await run("open", chatUrl.trim());
  await run("wait", "--text", "The order was rejected.");
  includes(await run("eval", "!document.body.innerText.includes('Graph\\nChat')"), "true");

  await run("open", `${baseUrl}/graphs`);
  await run("wait", "--text", "Graph definitions");
  tree = await snapshot();
  await run("click", reference(tree, 'link "Open graph"'));
  await run("wait", '[aria-label="orders.review node graph"]');
  await run(
    "wait",
    "--fn",
    "Boolean(document.querySelector('.flow-node--graph-start') && document.querySelector('.flow-node--graph-end'))",
  );
  includes(
    await run(
      "eval",
      '!document.querySelector(\'[aria-label="orders.review node graph"] .flow-node--agent,[aria-label="orders.review node graph"] .flow-node--tool\')',
    ),
    "true",
  );
  includes(
    await run(
      "eval",
      "['conditional:approved','parallel','join','loop'].every(label => document.body.innerText.includes(label))",
    ),
    "true",
  );
  includes(
    await run(
      "eval",
      "document.querySelector('.flow-node--graph-start').getBoundingClientRect().top < document.querySelector('.flow-node--graph-end').getBoundingClientRect().top",
    ),
    "true",
  );

  await run("open", `${baseUrl}/graph`);
  await run("wait", '[aria-label="Interactive capability graph"]');
  includes(
    await run(
      "eval",
      "['graph-start','graph-end','subgraph','subagent','resource-memory'].every(kind => document.querySelector('.flow-node--' + kind))",
    ),
    "true",
  );
  includes(
    await run(
      "eval",
      "['delegates to','provides resource'].every(label => document.body.innerText.includes(label))",
    ),
    "true",
  );
  includes(
    await run("eval", "!document.body.innerText.includes('sk-live-fixture-secret')"),
    "true",
  );

  await run("set", "viewport", "390", "844");
  includes(await run("eval", "document.documentElement.scrollWidth <= window.innerWidth"), "true");
}
