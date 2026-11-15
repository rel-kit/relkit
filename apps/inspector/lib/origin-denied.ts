/** The problem code of an application's origin check, answered with 403 before the call runs. */
export const ORIGIN_DENIED = "origin-denied";

/** What a refusal by the origin check means for a reader of the Inspector. */
export const ORIGIN_DENIED_TEXT =
  "The application's origin check refused this request (403, origin-denied). Inspector requests come from the Inspector's own address, so the application must allow that address.";

/** A 403 that carries no problem code: the origin check is the likely, not the proven, cause. */
export const BARE_FORBIDDEN_TEXT =
  "The application refused this request (403) before it ran. If its origin check refused it: Inspector requests come from the Inspector's own address, so the application must allow that address.";
