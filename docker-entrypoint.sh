#!/bin/sh
set -e
# runs as root: make the mounted DB dir writable by the app user (named vol OR bind mount)
mkdir -p /data && chown -R nextjs:nodejs /data
exec su-exec nextjs:nodejs sh -c 'node node_modules/prisma/build/index.js migrate deploy && exec node server.js'
