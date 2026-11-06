# Local PostgreSQL security tests

Run from the repository root:

```sh
./supabase/tests/run.sh
```

Capture both PostgreSQL notices and command output with failure propagation:

```sh
set -o pipefail
./supabase/tests/run.sh 2>&1 | tee supabase/tests/latest-run.log
```

Requires Bash and working Docker access. The default `postgres:17` image is pulled if missing. `POSTGRES_TEST_IMAGE` may select another PostgreSQL 17-compatible image; the runner uses the PostgreSQL 17 data directory layout.

The runner creates a unique `todo-hermes-ai-rls-*` container with no Docker networking, published host ports or host bind mounts. Database storage is ephemeral tmpfs. A random disposable password is generated locally, never printed or stored in repository files. EXIT/INT/TERM cleanup removes the container and anonymous volumes. Like any process, SIGKILL or a host crash cannot run its cleanup trap; remove any leftover named container with `docker rm -fv <name>`.

`bootstrap.sql` supplies only the local auth schema, two deterministic UUID users, `auth.uid()` reading `request.jwt.claim.sub`, and unprivileged `anon`/`authenticated` roles. It does not emulate an authentication service. The actual migration is applied unchanged. `rls.sql` runs **38 assertions** with explicit `SET ROLE` and SECURITY INVOKER helpers, then rolls back its fixtures and helpers. Expected denials check exact SQLSTATE (`42501`, `23514`, or `23502`), so unrelated SQL errors cannot masquerade as passing security checks.

The runner executes all 38 assertions, inserts a sentinel, reapplies the migration, checks that the sentinel remains unchanged, removes it, and executes the 38 assertions again. Thus each successful run performs 77 passing checks: 38 before rerun, one preservation check, 38 after rerun. Failure stops immediately with a nonzero exit status.

Coverage includes private defaults, owner CRUD, public-only anonymous/non-owner reads, zero-row non-owner writes to public and private rows, owner spoofing/reassignment, anonymous writes, TRUNCATE for both application roles, unpublishing, and invalid title/project/priority/date constraints (including valid boundary values).

These are **local database security tests**, not live Supabase authenticated verification. They do not validate production deployment, JWT signatures, signup/login, PostgREST, frontend behavior, or real Supabase users. No real project credentials or user data are used.

`latest-run.log` captures an actual successful run; rerunning the capture command replaces it.
