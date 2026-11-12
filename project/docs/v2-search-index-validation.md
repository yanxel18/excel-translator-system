# V2 search-index validation

## Scope and method

Validated the user, Base, and translation-history query shapes used by the API against a local disposable PostgreSQL 16.15 database. The seeded benchmark contained 50,002 users, 100,001 translation jobs, and the five built-in Bases. Plans were captured with `EXPLAIN (ANALYZE, BUFFERS)` after `ANALYZE`; timings below are single-run local observations, not production latency guarantees.

The local server reports `pg_trgm` 1.6 as available, and the new migration successfully installs it. PostgreSQL documents that `pg_trgm` GIN/GiST indexes can support `LIKE` and `ILIKE` substring searches; patterns with few/no extractable trigrams may still require scanning. See [PostgreSQL 16 `pg_trgm`](https://www.postgresql.org/docs/16/pgtrgm.html).

## Query findings

| Surface and representative query | Observed plan | Decision |
| --- | --- | --- |
| Admin-user count with the original combined `OR` over GID, username, email, and related Base code/name; rare substring `%rare-target-needle%` | Sequential scan of 50,002 users; 77.5 ms. The three user trigram indexes were not selected because the related-Base predicates were part of the same `OR`. | Resolve matching Base IDs with a separate Base code/name query, then use a User predicate consisting of text fields plus `baseId IN (...)`. Keep the three user GIN indexes: the resulting text-only search uses a `BitmapOr` over all three trigram indexes. |
| Refactored admin-user count and ordered page with `%rare-target-needle%` | Count: GIN `BitmapOr`/heap scan, 0.46 ms. Ordered page: GIN bitmap scan plus a one-row sort, 0.12 ms. | Retain `User_gid_trgm_idx`, `User_username_trgm_idx`, and `User_email_trgm_idx`. The service unit test covers the split Base lookup and combined result predicates; the PostgreSQL integration test covers both Base-code and direct text matches. |
| Base code/name substring `%JTY%` | Sequential scan of 5 Base rows; 0.015 ms. | Do not add a Base trigram index: the representative table is tiny and the scan is negligible. |
| History filename substring `%8139%` with owner scope | `TranslationJob_fileName_trgm_idx` GIN bitmap scan; 0.12 ms observed for the ordered page. The owner condition remains part of the heap filter. | Retain the filename GIN index. |
| Owner plus source/target language and descending creation-time/ID sort | `TranslationJob_owner_langs_created_id_idx` index-only scan; 0.038 ms for 20 rows. | Retain the composite history index. |
| Owner-scoped default history sorted by creation time/ID | `TranslationJob_ownerId_createdAt_id_idx` index-only scan; 0.059 ms for 20 rows. | Retain this wider index in place of the old owner/createdAt prefix index; do not keep both. |

Before the history-index migration, the 100,001-row filename-search plan was a sequential scan (~44 ms); after migration the representative search used the filename GIN index (~0.13 ms). The actual list service continues to constrain history by owner, and the integration test checks the expected owner-scoped result. These measurements are workload-specific and should be repeated with production-like distributions before further tuning.

## Migration and operational limits

Migration `20261112133000_v2_search_indexes` declares the indexes in Prisma and installs `pg_trgm` with `CREATE EXTENSION IF NOT EXISTS`. A fresh, empty local disposable database accepted the complete migration chain; the Changelog fallback check and populated migration/API integration passed (2/2). They verified fallback/database Changelog parity, extension/index deployment, absence of the replaced prefix index, Base-code and direct-text user search results, and owner-scoped history results.

Existing `User_baseId_idx`, `UserIdentity_userId_idx`, and the owner-leading history index support their foreign-key prefixes; no duplicate FK-only indexes were added. Index creation is ordinary (not `CONCURRENTLY`), so deployment operators must account for the write-lock window on populated tables. Availability of the extension, permissions to install it, lock duration, and plans on the deployed PostgreSQL version/data have not been verified. This is not a production deployment certification.
