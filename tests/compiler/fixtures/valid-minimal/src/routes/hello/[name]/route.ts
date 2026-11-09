import { defineRoute } from "relkit";
import hello from "../../../hello/service.js";

export const GET = defineRoute({
  id: "hello.route",
  target: hello.sayHello,
});
