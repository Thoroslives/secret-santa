#!/bin/sh
set -e
# runs as root: make the mounted DB dir writable by the app user (named vol OR bind mount)
mkdir -p /data && chown -R nextjs:nodejs /data
exec su-exec nextjs:nodejs sh -c 'prisma migrate deploy && exec node server.js'
