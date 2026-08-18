import { defineRoute, http } from "@zsys/app";
import echo from "../functions/echo.function.js";

export default defineRoute({
  id: "echo.http",
  method: "POST",
  path: "/echo",
  target: echo,
  request: http.input({ message: http.body("message") }),
  responses: [http.success(200, echo.output), http.validationError()],
});
