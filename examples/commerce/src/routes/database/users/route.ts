import { defineRoute } from "@zsys/app";
import databaseUsers from "../../../functions/database-users.function.js";

export const GET = defineRoute({ target: databaseUsers });
