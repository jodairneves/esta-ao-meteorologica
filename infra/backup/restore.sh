#!/bin/sh
# Restores a backup made by backup.sh (design §9.5). The dump goes into a new database, which then
# takes the place of the current one; the current one is kept under another name until dropped.
# Stop the collector and the dashboard first: a database in use cannot be renamed.
#   restore.sh <file.dump> [--yes]
# The connection comes from PGHOST, PGUSER, PGPASSWORD and PGDATABASE.
set -eu
# Only warnings and errors from the server (no "does not exist, skipping" notices).
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

BACKUP_DIR=${BACKUP_DIR:-/backups}
dump=${1:-}
if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "Uso: restore.sh <arquivo .dump> [--yes]" >&2
  echo "Backups disponíveis:" >&2
  find "$BACKUP_DIR" -name 'weather-*.dump' | sort >&2
  exit 1
fi

db=${PGDATABASE:?PGDATABASE não definida}
staging="${db}_restore"
previous="${db}_before_restore_$(date +%Y%m%d_%H%M%S)"

if [ "${2:-}" != --yes ]; then
  echo "O banco \"$db\" vai ser substituído pelo backup $dump."
  echo "O banco atual fica guardado como \"$previous\"."
  printf 'Digite o nome do banco (%s) para confirmar: ' "$db"
  read -r answer
  if [ "$answer" != "$db" ]; then
    echo "Restauração cancelada."
    exit 1
  fi
fi

psql() { command psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 --dbname=postgres "$@"; }

echo "Restaurando em \"$staging\"..."
psql -c "drop database if exists \"$staging\"" -c "create database \"$staging\""
if ! pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$staging" "$dump"; then
  echo "A restauração falhou; o banco \"$db\" não foi alterado." >&2
  psql -c "drop database if exists \"$staging\""
  exit 1
fi

# Both renames in one transaction: either the restored database takes the name, or nothing changes.
if ! psql -c "alter database \"$db\" rename to \"$previous\"; alter database \"$staging\" rename to \"$db\""; then
  echo "Não foi possível trocar os bancos: o coletor e o painel estão parados?" >&2
  echo "O backup restaurado ficou em \"$staging\"; o banco \"$db\" não foi alterado." >&2
  exit 1
fi

echo "Pronto: \"$db\" agora tem o conteúdo de $dump."
echo "Suba o coletor e o painel de novo. Quando estiver tudo certo, apague o banco anterior:"
echo "  psql -d postgres -c 'drop database \"$previous\"'"
