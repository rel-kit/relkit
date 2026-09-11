import { defineBucket } from "@relkit/app/buckets";

const agentWorkspace = defineBucket({
  id: "orders.agent-workspace",
  profile: "agent-workspace",
  visibility: "private",
  maxObjectBytes: 256_000,
  allowedContentTypes: ["text/markdown", "text/plain"],
});

export default agentWorkspace;
