#!/bin/sh
set -e
# runs as root: make the mounted DB dir writable by the app user (named vol OR bind mount)
mkdir -p /data && chown -R nextjs:nodejs /data
exec su-exec nextjs:nodejs sh -c '
  DB="/data/santa.db"
  if [ -f "$DB" ]; then
    cp "$DB" "$DB.bak-$(date +%Y%m%d%H%M%S)"
    ls -1t "$DB".bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f
  fi
  prisma migrate deploy && exec node server.js
'
