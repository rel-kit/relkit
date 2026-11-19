/** Bucket bound to one of the application's bucket profiles. */
import { defineBucket } from "relkit/buckets";

export default defineBucket({
  id: "orders.uploads",
  profile: "uploads",
  visibility: "private",
  maxObjectBytes: 5_000_000,
});
