import { defineService } from "relkit";
import sendReceipt from "./functions/send-receipt.function.js";

export default defineService({ functions: { sendReceipt } });
