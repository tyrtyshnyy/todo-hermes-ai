#!/usr/bin/env bash
# Local PostgreSQL policy tests only; never contacts a Supabase project.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${POSTGRES_TEST_IMAGE:-postgres:17}"
CONTAINER="todo-hermes-ai-rls-$(date +%s)-$$"
password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
started=0
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$started" == 1 ]]; then
    if ! docker rm -fv "$CONTAINER" >/dev/null; then
      printf 'ERROR: failed to remove test container %s\n' "$CONTAINER" >&2
      exit 1
    fi
    printf 'Removed ephemeral test container: %s\n' "$CONTAINER"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
command -v docker >/dev/null
printf 'LOCAL PostgreSQL RLS tests (not live Supabase authenticated verification)\n'
printf 'Image: %s; container: %s; no network, host ports or bind mounts\n' "$IMAGE" "$CONTAINER"
docker run --detach --name "$CONTAINER" --network none \
  --mount type=tmpfs,destination=/var/lib/postgresql/data \
  --env "POSTGRES_PASSWORD=$password" "$IMAGE" >/dev/null
started=1
unset password
ready=0
for ((attempt=0; attempt<90; attempt++)); do
  # The image's temporary init server only uses Unix sockets. Wait for the
  # final TCP listener inside the isolated container to avoid an init race.
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  docker logs "$CONTAINER" >&2
  printf 'ERROR: PostgreSQL did not become ready\n' >&2
  exit 1
fi
psql_in() { docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
psql_in -Atc 'select version();'
psql_in < "$HERE/bootstrap.sql"
printf '\nApplying actual migration, first run\n'
psql_in < "$HERE/../migrations/001_todos.sql"
printf '\nPolicy tests after initial migration\n'
psql_in < "$HERE/rls.sql"
# Retain a real row through the migration rerun to detect destructive reruns.
psql_in -c "insert into public.todos(id,user_id,title) values ('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111','Migration rerun sentinel');"
printf '\nApplying unchanged actual migration again\n'
psql_in < "$HERE/../migrations/001_todos.sql"
psql_in <<'SQL'
do $$
begin
  if not exists(select 1 from public.todos where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and title = 'Migration rerun sentinel' and not is_public) then
    raise exception 'FAIL: migration rerun changed existing data';
  end if;
  raise notice 'PASS: migration rerun preserves existing private data';
end $$;
delete from public.todos where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
SQL
printf '\nPolicy tests after migration rerun\n'
psql_in < "$HERE/rls.sql"
printf '\nPASS: both local PostgreSQL policy passes and migration rerun preservation\n'
