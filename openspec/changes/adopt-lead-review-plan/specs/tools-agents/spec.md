# Spec Delta

## REMOVED Requirements

### Requirement: Native LangChain execution is the default agent runtime

**Reason**: Agents run through a selected adapter (`agent-adapters`); LangChain is the first adapter
rather than the default runtime.

**Migration**: Add `runtime: langchain()` to existing agents; `relkit migrate` adds it.

### Requirement: Native models tools and middleware require no adapter wrapper

**Reason**: SDK-native models, tools and middleware move into the adapter's options
(`agent-adapters`).

**Migration**: Move native middleware and tools into `langchain({ ... })` and bind models through
model profiles; `relkit migrate` rewrites the declarations it can.
