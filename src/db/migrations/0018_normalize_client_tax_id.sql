-- C2: los NIT se guardan normalizados (sin espacios, guiones ni puntos, en
-- mayúsculas) para que "7745213-8" y "77452138" cuenten como el mismo.
-- Si al normalizar aparecen duplicados en un proyecto, el índice único hace
-- fallar la migración: revísalos antes con
--   SELECT project_id, upper(regexp_replace(tax_id, '[\s.-]', '', 'g')) AS nit, count(*)
--   FROM clients WHERE tax_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;
UPDATE "clients"
SET "tax_id" = NULLIF(upper(regexp_replace("tax_id", '[\s.-]', '', 'g')), '')
WHERE "tax_id" IS NOT NULL
  AND "tax_id" IS DISTINCT FROM NULLIF(upper(regexp_replace("tax_id", '[\s.-]', '', 'g')), '');