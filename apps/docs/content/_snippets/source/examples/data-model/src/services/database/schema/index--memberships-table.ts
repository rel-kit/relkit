export const memberships = sqliteTable(
  "memberships",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    organizationId: text().notNull(),
    userId: integer().notNull(),
    role: text().notNull(),
  },
  (table) => [uniqueIndex("membership_identity").on(table.organizationId, table.userId)],
);
