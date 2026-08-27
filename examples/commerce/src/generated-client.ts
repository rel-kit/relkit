import { createClient } from "@relkit/client";

export const liveHeaders = new Headers();
export const client = createClient({ baseUrl: "http://localhost:3000", headers: liveHeaders });
