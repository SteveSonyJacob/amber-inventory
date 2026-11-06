import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, check } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  quantity: integer("quantity").notNull(), price: integer("price").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [check("valid_stock", sql`${t.quantity} >= 0`), check("valid_price", sql`${t.price} >= 0`)]);
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(), fingerprint: text("fingerprint").notNull(),
  total: integer("total").notNull(), createdAt: text("created_at").notNull(),
});
export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => orders.id),
  productId: text("product_id").notNull().references(() => products.id),
  name: text("name").notNull(), quantity: integer("quantity").notNull(), price: integer("price").notNull(),
}, t => [check("positive_order_quantity", sql`${t.quantity} > 0`)]);
