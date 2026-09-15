import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const commitments = sqliteTable(
  "commitments",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull(),
    supplier: text("supplier").notNull(),
    issueDate: text("issue_date").notNull(),
    status: text("status", { enum: ["ativa", "encerrada", "suspensa"] })
      .notNull()
      .default("ativa"),
    notes: text("notes").notNull().default(""),
    totalCents: integer("total_cents").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [
    uniqueIndex("commitments_number_unique").on(table.number),
    index("commitments_status_idx").on(table.status),
  ],
);

export const commitmentItems = sqliteTable(
  "commitment_items",
  {
    id: text("id").primaryKey(),
    commitmentId: text("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull(),
    contractedQuantity: real("contracted_quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (table) => [
    uniqueIndex("commitment_items_line_unique").on(
      table.commitmentId,
      table.lineNumber,
    ),
    index("commitment_items_commitment_idx").on(table.commitmentId),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    commitmentId: text("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    orderDate: text("order_date").notNull(),
    status: text("status", { enum: ["rascunho", "faturado"] })
      .notNull()
      .default("rascunho"),
    notes: text("notes").notNull().default(""),
    calculatedTotalCents: integer("calculated_total_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [
    index("orders_commitment_idx").on(table.commitmentId),
    index("orders_date_idx").on(table.orderDate),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    commitmentItemId: text("commitment_item_id")
      .notNull()
      .references(() => commitmentItems.id, { onDelete: "cascade" }),
    quantity: real("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (table) => [
    uniqueIndex("order_items_line_unique").on(
      table.orderId,
      table.commitmentItemId,
    ),
    index("order_items_order_idx").on(table.orderId),
    index("order_items_commitment_item_idx").on(table.commitmentItemId),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    invoiceDate: text("invoice_date").notNull(),
    notes: text("notes").notNull().default(""),
    calculatedTotalCents: integer("calculated_total_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => [
    uniqueIndex("invoices_order_unique").on(table.orderId),
    index("invoices_date_idx").on(table.invoiceDate),
  ],
);

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    commitmentItemId: text("commitment_item_id")
      .notNull()
      .references(() => commitmentItems.id, { onDelete: "cascade" }),
    quantity: real("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (table) => [
    uniqueIndex("invoice_items_line_unique").on(
      table.invoiceId,
      table.commitmentItemId,
    ),
    index("invoice_items_invoice_idx").on(table.invoiceId),
    index("invoice_items_commitment_item_idx").on(table.commitmentItemId),
  ],
);

export const commitmentArchives = sqliteTable(
  "commitment_archives",
  {
    commitmentId: text("commitment_id")
      .primaryKey()
      .references(() => commitments.id, { onDelete: "cascade" }),
    archivedAt: text("archived_at").notNull(),
    archivedBy: text("archived_by").notNull().default(""),
  },
  (table) => [index("commitment_archives_date_idx").on(table.archivedAt)],
);

export const commitmentReinforcements = sqliteTable(
  "commitment_reinforcements",
  {
    id: text("id").primaryKey(),
    commitmentId: text("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    reinforcementDate: text("reinforcement_date").notNull(),
    notes: text("notes").notNull().default(""),
    totalCents: integer("total_cents").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [
    index("commitment_reinforcements_commitment_idx").on(table.commitmentId),
    index("commitment_reinforcements_date_idx").on(table.reinforcementDate),
  ],
);

export const commitmentReinforcementItems = sqliteTable(
  "commitment_reinforcement_items",
  {
    id: text("id").primaryKey(),
    reinforcementId: text("reinforcement_id")
      .notNull()
      .references(() => commitmentReinforcements.id, { onDelete: "cascade" }),
    commitmentItemId: text("commitment_item_id")
      .notNull()
      .references(() => commitmentItems.id, { onDelete: "cascade" }),
    addedQuantity: real("added_quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    addedTotalCents: integer("added_total_cents").notNull(),
  },
  (table) => [
    uniqueIndex("commitment_reinforcement_items_line_unique").on(
      table.reinforcementId,
      table.commitmentItemId,
    ),
    index("commitment_reinforcement_items_reinforcement_idx").on(
      table.reinforcementId,
    ),
    index("commitment_reinforcement_items_commitment_item_idx").on(
      table.commitmentItemId,
    ),
  ],
);

export const commitmentAnnulments = sqliteTable(
  "commitment_annulments",
  {
    id: text("id").primaryKey(),
    commitmentId: text("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["parcial", "total"] }).notNull(),
    reference: text("reference").notNull(),
    annulmentDate: text("annulment_date").notNull(),
    notes: text("notes").notNull().default(""),
    calculatedTotalCents: integer("calculated_total_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [
    index("commitment_annulments_commitment_idx").on(table.commitmentId),
    index("commitment_annulments_date_idx").on(table.annulmentDate),
  ],
);

export const commitmentAnnulmentItems = sqliteTable(
  "commitment_annulment_items",
  {
    id: text("id").primaryKey(),
    annulmentId: text("annulment_id")
      .notNull()
      .references(() => commitmentAnnulments.id, { onDelete: "cascade" }),
    commitmentItemId: text("commitment_item_id")
      .notNull()
      .references(() => commitmentItems.id, { onDelete: "cascade" }),
    annulledQuantity: real("annulled_quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    annulledTotalCents: integer("annulled_total_cents").notNull(),
  },
  (table) => [
    uniqueIndex("commitment_annulment_items_line_unique").on(
      table.annulmentId,
      table.commitmentItemId,
    ),
    index("commitment_annulment_items_annulment_idx").on(
      table.annulmentId,
    ),
    index("commitment_annulment_items_commitment_item_idx").on(
      table.commitmentItemId,
    ),
  ],
);

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
