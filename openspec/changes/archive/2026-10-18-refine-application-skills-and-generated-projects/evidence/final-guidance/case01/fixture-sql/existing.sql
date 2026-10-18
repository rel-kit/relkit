-- Explicit fixture setup SQL, not generated Drizzle migration metadata.
CREATE TABLE notes (id INTEGER PRIMARY KEY, content TEXT NOT NULL);
INSERT INTO notes (id, content) VALUES (0, 'Preserve this existing record');
CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
  ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, issuer TEXT NOT NULL,
  providerId TEXT NOT NULL, userId TEXT NOT NULL, accessToken TEXT, refreshToken TEXT, idToken TEXT,
  accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX account_issuer_account_id ON account (issuer, accountId);
CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
