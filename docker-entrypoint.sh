#!/bin/sh
set -e
# runs as root: make the mounted DB dir writable by the app user (named vol OR bind mount)
mkdir -p /data && chown -R nextjs:nodejs /data
exec su-exec nextjs:nodejs sh -c '
  DB="/data/santa.db"
  if [ -f "$DB" ]; then
    cp "$DB" "$DB.bak-$(date +%Y%m%d%H%M%S)"
  fi
  prisma migrate deploy && exec node server.js
'
