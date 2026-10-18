import { expect, test } from "bun:test";
import { openDatabase } from "../src/services/database/service.js";
import { getOrderStatus, setOrderStatus } from "../src/services/database/order-status.js";

test("order status migration, storage, update and rejection", async () => {
  const db = openDatabase(":memory:");
  try {
    db.exec(await Bun.file(new URL("../src/services/database/migrations/0001-order-status.sql", import.meta.url)).text());
    expect(getOrderStatus(db, "missing")).toBeNull();
    setOrderStatus(db, "order-1", "pending");
    expect(getOrderStatus(db, "order-1")).toBe("pending");
    setOrderStatus(db, "order-1", "shipped");
    expect(getOrderStatus(db, "order-1")).toBe("shipped");
    expect(() => setOrderStatus(db, "", "pending")).toThrow();
    expect(() => setOrderStatus(db, "order-1", "invalid" as never)).toThrow();
    expect(getOrderStatus(db, "order-1")).toBe("shipped");
  } finally { db.close(); }
});
