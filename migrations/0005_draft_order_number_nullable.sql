-- Allow order_number to be NULL so draft orders can be saved without a number
ALTER TABLE "orders" ALTER COLUMN "order_number" DROP NOT NULL;
