-- B6: el contador de folios empezó en 0 para todos los proyectos. Si ya había
-- cotizaciones con folio (creadas antes del contador), se inicializa con el
-- número más alto usado para que la siguiente no choque con una existente.
INSERT INTO "quote_folio_counters" ("project_id", "last_number")
SELECT "project_id", COALESCE(MAX(NULLIF(substring("folio" from '([0-9]+)$'), '')::int), 0)
FROM "quotes"
GROUP BY "project_id"
ON CONFLICT ("project_id") DO UPDATE
  SET "last_number" = GREATEST("quote_folio_counters"."last_number", EXCLUDED."last_number");