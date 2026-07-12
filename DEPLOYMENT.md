# Deployment

This fork runs as a **single Docker container** backed by a **SQLite file** on a
mounted volume. There is no separate database server. For the full environment
variable list and the migrate/backup behaviour, see the **Deployment** section of
the [README](README.md#deployment); this guide covers running the container,
putting it behind HTTPS, and backing up the data.

## Run the container

Copy `.env.example` to `.env` and fill it in (at minimum `SESSION_SECRET`,
`ADMIN_BREAKGLASS_PASSWORD`, and `NEXTAUTH_URL`).

**Docker Compose** (the bundled `docker-compose.yml` builds from source, maps host
`3001` to container `3000`, and stores the SQLite file in a named `santa_data`
volume). It only passes `SESSION_SECRET` by default, so add the rest of your env
to the `environment:` list or use the `docker run` form below for a real deploy:

```bash
SESSION_SECRET=$(openssl rand -base64 32) docker compose up -d --build
docker compose logs -f app
```

**Plain `docker run`** against a prebuilt image, passing the whole `.env`:

```bash
docker run -d --name secret-santa \
  -p 3001:3000 \
  -v santa_data:/data \
  --env-file .env \
  <image>
```

The entrypoint runs `prisma migrate deploy` on every start and snapshots the
SQLite file to `/data/santa.db.bak-*` immediately before migrating. Start from an
empty `/data` volume and set `ADMIN_BREAKGLASS_PASSWORD` before the first boot, or
you will not be able to sign in as admin.

## HTTPS (reverse proxy)

Terminate TLS at a reverse proxy in front of the container and leave
`COOKIE_SECURE` at its default (secure in production). Any proxy works; Caddy for
example:

```
santa.example.com {
    reverse_proxy localhost:3001
}
```

Set `NEXTAUTH_URL` to the public HTTPS origin so the durable `/p/<token>` links in
emails resolve correctly, and register the admin OIDC provider's redirect URI to
match `OIDC_REDIRECT_URI`. Leave the `OIDC_*` variables unset to run
break-glass-only until the provider exists.

## Backups

The entire dataset is one SQLite file at `/data/santa.db`. Back it up by copying
the file out of the volume (the container also keeps the last few pre-migration
`.bak-*` snapshots in `/data`):

```bash
docker cp secret-santa:/data/santa.db ./santa-backup-$(date +%Y%m%d).db
```

Restore by stopping the container, copying a backup back to `/data/santa.db`, and
starting again.

## Updating

Pull the new image (or `git pull` and rebuild), then recreate the container. The
`santa_data` volume persists, and the entrypoint migrates the existing database on
start (taking a `.bak-*` snapshot first).
