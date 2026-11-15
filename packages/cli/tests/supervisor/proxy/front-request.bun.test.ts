/**
 * 27.1 through the development front on Bun: a malformed `Host`, a leading `//`, a blocked
 * inspection path, a throw in the front and a read that carries a body. Pipelined requests are
 * not declared: Bun 1.3.10's own listener closes a connection with no answer when a second request
 * arrives while the first is answered asynchronously, with or without the front.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { declareFrontSuite } from "./front-request.suite.ts";

declareFrontSuite({ test, beforeAll, afterAll, expect }, false);
