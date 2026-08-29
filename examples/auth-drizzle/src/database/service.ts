import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";

export default defineDrizzleService({
  schema,
  client: ({ env }) => {
    const sqlite = new Database(env.DATABASE_PATH);
    sqlite.exec(
      "create table if not exists user (id text primary key, name text not null, email text not null unique, emailVerified integer not null, image text, createdAt integer not null, updatedAt integer not null); create table if not exists session (id text primary key, expiresAt integer not null, token text not null unique, ipAddress text, userAgent text, userId text not null, createdAt integer not null, updatedAt integer not null); create table if not exists account (id text primary key, accountId text not null, issuer text not null, providerId text not null, userId text not null, accessToken text, refreshToken text, idToken text, accessTokenExpiresAt integer, refreshTokenExpiresAt integer, scope text, password text, createdAt integer not null, updatedAt integer not null, unique (issuer, accountId)); create table if not exists verification (id text primary key, identifier text not null, value text not null, expiresAt integer not null, createdAt integer not null, updatedAt integer not null)",
    );
    return drizzle({ client: sqlite });
  },
  dispose: (database) => database.$client.close(),
});
