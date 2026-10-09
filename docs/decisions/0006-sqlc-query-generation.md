# 0006: sqlc query generation without runtime dependencies

Status: accepted

Hand-maintained positional parameters and Scan destinations become fragile as prototype
entities change. Use sqlc v1.31.0 to compile named, parameterized SQLite queries into
standard database/sql code. Keep queries and generated packages inside their owning
module; use the existing goose migrations as the schema source. No ORM, second schema,
database server, or new application runtime dependency is introduced.

Pin the generator and checksums in an isolated Go tool module. Check in generated code
so application builds and deployments do not need the generator. A Node script generates
into a temporary directory; make sqlc updates outputs and make sqlc-check checks content
and file-set drift without modifying repository artifacts. The full verification gate
includes this check without requiring Git or opening a developer database.

Repositories still own explicit transaction boundaries, domain error translation and
mapping persistence types to API DTOs. Notes updates use scoped UPDATE RETURNING to
return the changed row without a separate read. Count and list use a single read snapshot;
admin creation and session pruning/insertion remain atomic. sqlc does not enforce tenant
authorization: workspace predicates and membership checks remain mandatory.

Consequences: development/CI needs a first-time tool download/build; generated source and
an isolated tool lockfile add repository files. Database/API field mapping remains explicit
by name to prevent internal columns from accidentally becoming public API fields.
