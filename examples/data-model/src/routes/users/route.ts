import { defineRoute } from "@zsys/app";
import listUsers from "../../functions/list-users.function.js";

export const GET = defineRoute({ target: listUsers });
