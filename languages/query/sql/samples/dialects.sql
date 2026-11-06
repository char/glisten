-- PostgreSQL
SELECT payload->>'title', $1::text, E'line\nnext', $body$it 'works'$body$
FROM events WHERE id = :id AND active = TRUE;
/* MySQL and SQLite */
SELECT `order`, [group], "column", @user, ?1 FROM data LIMIT 10;
