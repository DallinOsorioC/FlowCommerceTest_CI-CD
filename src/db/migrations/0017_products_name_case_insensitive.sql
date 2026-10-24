-- P2: el nombre de producto es único por proyecto SIN distinguir mayúsculas.
-- Si en alguna base ya existen duplicados ("Licencia" y "licencia"), esta
-- migración falla: revísalos antes con
--   SELECT project_id, lower(name), count(*) FROM products GROUP BY 1, 2 HAVING count(*) > 1;
DROP INDEX IF EXISTS "products_project_id_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "products_project_id_name_unique" ON "products" USING btree ("project_id",lower("name"));