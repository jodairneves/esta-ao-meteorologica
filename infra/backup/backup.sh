#!/bin/sh
# Daily backup (design §9.5): a pg_dump of the database plus a copy of the broker logins
# (Dynamic Security file). Keeps KEEP_DAILY daily copies and KEEP_WEEKLY weekly ones (Sundays).
#   backup.sh       runs forever: one backup a day, at BACKUP_HOUR (in TZ) or right after a later start
#   backup.sh now   one backup now, then exits
# The connection comes from PGHOST, PGUSER, PGPASSWORD and PGDATABASE.
set -eu
# Dumps hold password hashes: readable only by the owner.
umask 077

BACKUP_DIR=${BACKUP_DIR:-/backups}
BACKUP_HOUR=${BACKUP_HOUR:-3}
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}
# Empty: no broker logins to copy (the broker belongs to another stack).
BROKER_FILE=${BROKER_FILE-/mosquitto-data/dynamic-security.json}

log() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') $*"; }

# Keeps the newest $2 backups of directory $1 (a dump and its broker file share the date).
prune() {
  ls -1 "$1" | grep -E '^weather-[0-9-]+\.dump$' | sort -r | tail -n +"$(($2 + 1))" |
    while read -r name; do
      day=${name#weather-}
      day=${day%.dump}
      rm -f "$1/$name" "$1/mosquitto-$day.json"
      log "backup antigo removido: $1/$name"
    done
}

backup() {
  day=$(date +%F)
  dump="$BACKUP_DIR/daily/weather-$day.dump"
  log "backup iniciado"
  if ! pg_dump --format=custom --file="$dump.partial"; then
    rm -f "$dump.partial"
    log "FALHA no backup: o pg_dump não terminou"
    return 1
  fi
  mv "$dump.partial" "$dump"
  if [ -z "$BROKER_FILE" ]; then
    :
  elif [ -f "$BROKER_FILE" ]; then
    cp "$BROKER_FILE" "$BACKUP_DIR/daily/mosquitto-$day.json"
  else
    log "aviso: $BROKER_FILE não encontrado; só o banco foi copiado"
  fi
  if [ "$(date +%u)" = 7 ]; then
    cp "$BACKUP_DIR/daily/"*"-$day".* "$BACKUP_DIR/weekly/"
  fi
  prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
  prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
  log "backup concluído: $dump ($(du -h "$dump" | cut -f1))"
}

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
# Left behind when the container stopped in the middle of a dump.
rm -f "$BACKUP_DIR/daily/"*.partial

if [ "${1:-}" = now ]; then
  backup
  exit
fi

trap 'exit 0' INT TERM
log "backups diários às ${BACKUP_HOUR}h ($(date +%Z)) em $BACKUP_DIR"
while true; do
  hour=$(date +%H)
  if [ ! -f "$BACKUP_DIR/daily/weather-$(date +%F).dump" ] && [ "${hour#0}" -ge "$BACKUP_HOUR" ]; then
    # A failure is logged and tried again on the next round.
    backup || true
  fi
  # In the background, so that a stop signal is handled right away.
  sleep 300 &
  wait $!
done
