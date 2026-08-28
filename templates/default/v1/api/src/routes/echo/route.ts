import { defineRoute } from "@relkit/app/routes";
import echo from "@app/functions/echo.function.js";

export const POST = defineRoute({
  target: echo,
});
