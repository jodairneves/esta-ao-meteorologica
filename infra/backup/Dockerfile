# Daily backups (design §9.5), with the pg_dump of the same Postgres version as the database.
# Runs as root: the broker writes its login file readable only by its own user.
FROM postgres:18.6-alpine
RUN apk add --no-cache tzdata
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
ENTRYPOINT []
CMD ["backup.sh"]
