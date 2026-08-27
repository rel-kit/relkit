import { defineRoute } from "@relkit/app";
import echo from "../../functions/echo.function.js";

export const POST = defineRoute({
  target: echo,
});
