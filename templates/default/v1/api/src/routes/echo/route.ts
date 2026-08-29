import { defineRoute } from "@relkit/app/routes";
import echo from "@app/echo/service.js";

export const POST = defineRoute({
  target: echo.echo,
});
