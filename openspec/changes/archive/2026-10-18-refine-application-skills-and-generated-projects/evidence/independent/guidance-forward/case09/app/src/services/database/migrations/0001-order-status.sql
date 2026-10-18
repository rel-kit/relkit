CREATE TABLE order_status (
  order_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled'))
);
