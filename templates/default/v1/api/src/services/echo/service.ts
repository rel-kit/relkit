/** Declares the echo service boundary and its public members. */
import { defineService } from "@relkit/app/services";
import echo from "@app/services/echo/functions/echo.function.js";

export default defineService({ functions: { echo } });
