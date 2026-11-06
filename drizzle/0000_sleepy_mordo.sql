CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_order_quantity" CHECK("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`total` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "valid_stock" CHECK("products"."quantity" >= 0),
	CONSTRAINT "valid_price" CHECK("products"."price" >= 0)
);
--> statement-breakpoint
CREATE TRIGGER order_item_stock BEFORE INSERT ON order_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM products WHERE id = NEW.product_id AND quantity >= NEW.quantity
  ) THEN RAISE(ABORT, 'insufficient_stock') END;
  UPDATE products SET quantity = quantity - NEW.quantity WHERE id = NEW.product_id;
END;
