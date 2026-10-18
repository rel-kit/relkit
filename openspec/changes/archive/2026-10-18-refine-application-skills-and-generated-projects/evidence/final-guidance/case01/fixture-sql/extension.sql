-- Explicit fixture setup SQL, not generated Drizzle migration metadata.
CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user (id),
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL
);
