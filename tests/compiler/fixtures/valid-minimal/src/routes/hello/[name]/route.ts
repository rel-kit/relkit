import { defineRoute } from "@relkit/app";
import hello from "../../../hello/service.js";

export const GET = defineRoute({
  id: "hello.route",
  target: hello.sayHello,
});
