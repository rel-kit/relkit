/** Maps the HTTP endpoint to its owning service's public member. */
import { defineRoute } from "@relkit/app/routes";
import echo from "@app/services/echo/service.js";

export const POST = defineRoute({
  target: echo.echo,
});
