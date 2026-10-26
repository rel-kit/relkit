export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});
