-- A small portable schema
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer VARCHAR(120) NOT NULL,
  total NUMERIC(10, 2) DEFAULT 0,
  paid BOOLEAN DEFAULT FALSE
);
INSERT INTO orders (id, customer, total) VALUES (1, 'O''Brien', 19.95);
SELECT customer, sum(total) AS amount FROM orders
WHERE paid IS NOT TRUE GROUP BY customer HAVING sum(total) > 10;
