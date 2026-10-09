# SQL generation

`internal/modules/lab/queries.sql` owns named parameterized queries. Root `sqlc.yaml`
reads existing goose migrations (including preserved historical migrations), and
`make sqlc` generates module-local dbgen. `tools/sqlc` remains an isolated tool module
with a pinned generator and checksums. `make sqlc-check` generates in a temporary
directory and compares file sets without mutating checked-in artifacts.

Repositories own transactions, sequence allocation, domain error mapping and API
DTO conversion. Never expose dbgen structs as API contracts. Events are always read
with an explicit run_id and ordered by seq. Run IDs are the local Lab boundary;
there is no active workspace or tenancy model. Update tests and run make verify
when changing migrations or queries. Never edit generated code by hand.
