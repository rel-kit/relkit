import { defineRoute } from "@relkit/app";
import echo from "@app/functions/echo.function.js";

export const POST = defineRoute({
  target: echo,
});
