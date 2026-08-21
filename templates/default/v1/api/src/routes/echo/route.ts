import { defineRoute } from "@zsys/app";
import echo from "../../functions/echo.function.js";

export const POST = defineRoute({
  target: echo,
});
