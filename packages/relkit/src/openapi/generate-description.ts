/**
 * The paragraphs every generated document carries about answers that hold for every route and are
 * therefore not generated per operation: listing `HEAD` and `OPTIONS` for each route would double
 * the document and every client generated from it, and 431 is sent before a route is known.
 */
export const SERVER_ANSWERS_DESCRIPTION = [
  "### Answers every route gives",
  "Every `GET` route also answers `HEAD`, with the headers of the `GET` answer and no body. `OPTIONS` on a path that has routes answers `204` with an `Allow` header that lists the path's methods. Neither is listed as an operation unless a route declares it.",
  "A request whose headers are larger than the HTTP server accepts is answered `431` before a route is chosen, so no operation lists it.",
].join("\n\n");
