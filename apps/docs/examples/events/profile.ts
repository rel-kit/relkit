/**
 * Describes the explicit file-backed event profile used by the manual tutorial.
 * The app config imports this value; the selected runtime activates it after
 * checking, without adding a Docker dependency or enabling inspection.
 */
import { localEvent } from "@relkit/local";

export const event = localEvent();
