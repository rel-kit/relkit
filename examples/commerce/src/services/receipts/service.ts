/** Declares the receipts service boundary without acquiring native clients. */
import { defineService } from "relkit/services";
import sendReceipt from "./functions/send-receipt.function.js";

export default defineService({ functions: { sendReceipt } });
