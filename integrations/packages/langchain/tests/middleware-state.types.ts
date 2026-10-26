/** Compiles native middleware state inference through the root type-fixture suite, retaining annotation fields, SDK todo values and private-key filtering across installed peer instances. No model is invoked. */
import { Annotation } from "@langchain/langgraph";
import { createMiddleware, todoListMiddleware } from "langchain";
import type {
  AgentClientStateKey,
  AgentMiddlewareState,
} from "../src/define-agent-native.types.ts";

const annotations = createMiddleware({
  name: "fixture.peer-state",
  stateSchema: Annotation.Root({
    summary: Annotation<string>(),
    attempts: Annotation<number>(),
    _private: Annotation<string>(),
  }),
});
const todos = todoListMiddleware();

/** Concrete SDK tuple used to check both annotation and Zod-backed inference. */
type Middleware = readonly [typeof annotations, typeof todos];

/** Public values retain the field types supplied by each native middleware. */
type State = AgentMiddlewareState<Middleware>;

/** Only authored public fields may be selected for client exposure. */
type StateKey = AgentClientStateKey<Middleware>;

const state: State = {
  summary: "Release checked",
  attempts: 1,
  todos: [{ content: "Verify publication", status: "completed" }],
};
state.summary satisfies string;
state.attempts satisfies number;
"summary" satisfies StateKey;
"todos" satisfies StateKey;

// @ts-expect-error Annotation values must not widen across peer instances.
"invalid" satisfies State["attempts"];
// @ts-expect-error SDK todo state retains its finite status vocabulary.
"invalid" satisfies State["todos"][number]["status"];
// @ts-expect-error Internal middleware state is never a public client key.
"_private" satisfies StateKey;
// @ts-expect-error Empty middleware tuples expose no state keys.
"summary" satisfies AgentClientStateKey<readonly []>;
