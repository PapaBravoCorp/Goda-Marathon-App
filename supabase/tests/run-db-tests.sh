#!/usr/bin/env bash
# Database tests on a throwaway local PostgreSQL. Never touches Supabase.
#
#   bash supabase/tests/run-db-tests.sh
#
# Creates a temporary cluster, applies bootstrap.sql (stand-ins for Supabase's
# auth/storage/roles), then EVERY migration in supabase/migrations in order --
# the real files, so the tests run against the real is_admin() and the real
# policies -- then each *.test.sql here. Every migration that ships a rollback
# script (supabase/rollbacks/NNNN_name.down.sql) is also checked: it can be
# re-run, the rollbacks run newest first remove everything they should, and the
# migrations re-apply afterwards.
#
# Needs PostgreSQL 15+ server binaries (initdb, pg_ctl, psql). Set PG_BIN to
# their folder if they are not on PATH. PGTEST_PORT picks the port (54329).

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${PGTEST_PORT:-54329}"

# Everything the reversible migrations create; all of it must be gone after
# their rollbacks run. Add to these lists when a new rollback script is added.
ADDED_TABLES="'stats_viewers', 'registration_log'"
ADDED_FUNCTIONS="'can_view_stats', 'get_reg_stats', 'list_registrations_basic', 'mask_phone', 'mask_email', 'log_registration_event', 'admin_registration_log', '_live_entry_email', '_phone10'"

if [ -z "${PG_BIN:-}" ]; then
  if command -v pg_ctl >/dev/null 2>&1; then
    PG_BIN="$(dirname "$(command -v pg_ctl)")"
  elif [ -x "/c/Program Files/PostgreSQL/17/bin/pg_ctl.exe" ]; then
    PG_BIN="/c/Program Files/PostgreSQL/17/bin"
  else
    echo "PostgreSQL binaries not found. Set PG_BIN to the folder holding pg_ctl." >&2
    exit 2
  fi
fi

WORK="$(mktemp -d)"
DATA="$WORK/data"
LOG="$WORK/out.log"

stop_cluster() {
  "$PG_BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 </dev/null
  rm -rf "$WORK"
}
trap stop_cluster EXIT

fail() {
  echo "FAILED: $1" >&2
  if [ -s "$LOG" ]; then
    echo "---- last output ----" >&2
    tail -n 30 "$LOG" >&2
  fi
  exit 1
}

run_sql() {
  # $1 = file. Stops at the first error. check_function_bodies=off is what
  # pg_dump restores use: function bodies are checked when called, not when
  # created, so stand-in tables need only the columns that DDL touches.
  PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning" \
    "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h localhost -p "$PORT" -U postgres -d postgres \
    -f "$1" >"$LOG" 2>&1
}

query() {
  # $1 = SQL. Prints the bare result, without the CR that psql adds on Windows.
  "$PG_BIN/psql" -X -A -t -h localhost -p "$PORT" -U postgres -d postgres -c "$1" | tr -d '\r'
}

echo "Starting a throwaway PostgreSQL on port $PORT"
"$PG_BIN/initdb" -D "$DATA" -U postgres -A trust -E UTF8 --no-locale >"$LOG" 2>&1 \
  || fail "initdb"
"$PG_BIN/pg_ctl" -D "$DATA" -l "$WORK/server.log" -o "-p $PORT -c TimeZone=UTC" start \
  >/dev/null 2>&1 </dev/null
for _ in $(seq 1 30); do
  "$PG_BIN/pg_isready" -h localhost -p "$PORT" -q && break
  sleep 1
done
"$PG_BIN/pg_isready" -h localhost -p "$PORT" -q || fail "server did not start (see $WORK/server.log)"

run_sql "$HERE/bootstrap.sql" || fail "bootstrap.sql"

checks=0
ok() { echo "ok - $1"; checks=$((checks + 1)); }

count=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  run_sql "$f" || fail "migration $(basename "$f")"
  count=$((count + 1))
done
ok "applied $count migrations"

# Migrations that ship a rollback script, oldest first.
reversible=()
for d in "$ROOT"/supabase/rollbacks/*.down.sql; do
  [ -e "$d" ] && reversible+=("$(basename "$d" .down.sql)")
done

for m in "${reversible[@]}"; do
  run_sql "$ROOT/supabase/migrations/$m.sql" || fail "re-running $m"
  ok "$m can be re-run"
done

for t in "$HERE"/*.test.sql; do
  echo "== $(basename "$t")"
  PGOPTIONS="-c client_min_messages=notice" \
    "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h localhost -p "$PORT" -U postgres -d postgres \
    -f "$t" >"$LOG" 2>&1
  status=$?
  grep -o "ok - .*" "$LOG"
  [ $status -eq 0 ] || fail "$(basename "$t")"
  checks=$((checks + $(grep -c "ok - " "$LOG")))
done

# Roll back newest first, the order a person would follow.
for (( i = ${#reversible[@]} - 1; i >= 0; i-- )); do
  m="${reversible[$i]}"
  run_sql "$ROOT/supabase/rollbacks/$m.down.sql" || fail "rollback $m"
  ok "$m rolls back"
done

left=$(query "
  select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ($ADDED_TABLES))
       + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ($ADDED_FUNCTIONS))")
[ "$left" = "0" ] || fail "rollbacks left $left object(s) behind"
ok "rollbacks remove every table and function they added"

[ "$(query "select count(*) from pg_proc where proname = 'is_admin'")" = "1" ] \
  || fail "a rollback removed is_admin()"
ok "rollbacks leave is_admin() in place"

for m in "${reversible[@]}"; do
  run_sql "$ROOT/supabase/migrations/$m.sql" || fail "re-applying $m after rollback"
  ok "$m re-applies after rollback"
done

echo "All database tests passed ($checks checks)."
