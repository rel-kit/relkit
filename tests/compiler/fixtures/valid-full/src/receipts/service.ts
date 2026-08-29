import { defineService } from "@relkit/app";
import sendReceipt from "./functions/send-receipt.function.js";

export default defineService({ functions: { sendReceipt } });
