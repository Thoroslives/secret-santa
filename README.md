# Secret Santa - Multi-Tenant Gift Exchange Platform

A free, self-hosted web application for managing Secret Santa gift exchanges. Perfect for families, friend groups, and communities worldwide. Features multi-tenancy, durable personal login links, wishlist management, and automated Secret Santa partner assignments.

## Features

- **Multi-Tenant**: Unlimited groups can use the same installation
- **Group Creation**: Admin-only - a single super-admin creates and manages every group (no public sign-up)
- **Invite Codes**: Share a 6-character code to invite people to your group
- **Admin Portal**: Manage participants, send personal login links, and create Secret Santa assignments
- **User Login**: Durable personal link (`/p/<token>`) with self-service email resend - no user accounts needed
- **Wishlist Management**: Each person can add 1-5 gift items with links
- **Secret Santa Assignments**: Automated partner generation ensuring valid assignments
- **Mobile Responsive**: Works great on phones, tablets, and desktops
- **Data Isolation**: Each group's data is completely isolated from others

## Tech Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
- **Database**: SQLite (single file) with Prisma ORM
- **Styling**: Tailwind CSS
- **Authentication**: Durable personal link for participants; single super-admin (OIDC + break-glass) for admin
- **Deployment**: Docker & Docker Compose

## Getting Started

### Prerequisites

**For Development:**
- Node.js 18+ installed
- SQLite (bundled, no external DB server) OR Docker

**For Production (Easiest):**
- Docker and Docker Compose
- That's it!

### Quick Start with Docker (Recommended)

```bash
# 1. Start everything
docker-compose up -d

# 2. Access at http://localhost:3000
```

That's it! See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment.

### Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up your database**

   Update `.env`:
   ```
   DATABASE_URL="file:./dev.db"
   ```
   SQLite is a single file - no external database server to install or configure.

3. **Run database migrations**
   ```bash
   npx prisma migrate dev
   ```

4. **Generate Prisma Client**
   ```bash
   npx prisma generate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### For Admins

1. Go to `/admin` and login with your admin password
2. Add family members to the system (each gets a durable personal login link)
3. Share each person's personal link with them (or trigger the self-service email resend from `/login`)
4. Once everyone has added their wishlist, click "Generate Assignments" to create Secret Santa pairs
5. View all assignments to verify everything worked

### For Participants

1. Visit your personal link (`/p/<token>`), or go to `/login` to request one by email
2. Add 3-5 items to your wishlist with links
3. Save your wishlist
4. View your Secret Santa assignment to see who you're buying for
5. Check their wishlist for gift ideas

## Database Schema

- **Person**: Stores participant information and personal link tokens
- **WishlistItem**: Stores gift items for each person
- **Assignment**: Tracks who gives to whom each year

## Secret Santa Algorithm

The application uses a derangement algorithm to ensure:
- Everyone gives to exactly one person
- Everyone receives from exactly one person
- No one gives to themselves
- Minimum of 3 people required

## Development

### Project Structure

```
/app
  /admin          - Admin portal pages
  /api            - API routes
  /login          - User login page
  /wishlist       - User wishlist page
/lib              - Utilities and database client
/prisma           - Database schema
/components       - Reusable UI components (if needed)
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npx prisma studio` - Open Prisma Studio to view/edit database

### Database Commands

- `npx prisma migrate dev` - Create and apply migrations
- `npx prisma generate` - Generate Prisma Client
- `npx prisma studio` - Open database GUI
- `npx prisma migrate reset` - Reset database (careful!)

## Admin Authentication

There is a single super-admin account with access to every group - not one
admin per group. Sign in at `/admin` using either method:

- **OIDC** - sign in through an external identity provider (e.g. Authentik).
  Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and
  `OIDC_REDIRECT_URI`, then add the admin's email address to the
  comma-separated `ADMIN_OIDC_ALLOWED_EMAILS` allowlist (the email returned
  by the provider must come back verified). Leave the `OIDC_*` variables
  unset to disable OIDC entirely and run break-glass-only.
- **Break-glass password** - set `ADMIN_BREAKGLASS_PASSWORD` and sign in
  with that password directly, no external provider required.

**Set at least one of these (typically the break-glass password) or you
cannot sign in as admin at all.**

Group creation is admin-only; there is no public sign-up flow. See
`.env.example` for the full list of admin-auth variables with placeholder
values.

## Deployment

### Environment Variables

Make sure to set these in your production environment:

```
DATABASE_URL=file:/data/santa.db
SESSION_SECRET=your-session-encryption-key-min-32-chars
ADMIN_BREAKGLASS_PASSWORD=your-strong-break-glass-password
```

For OIDC and the full list of admin-auth variables, see the "Admin
Authentication" section above and `.env.example`.

### Deploy Notes (Docker)

The Docker entrypoint runs `prisma migrate deploy` on every container
start, and takes a timestamped `/data/santa.db.bak-*` snapshot of the
SQLite database immediately before migrating (skipped on first boot, when
no database file exists yet).

This P4 build is a fresh/disposable deploy: start from an empty `/data`
volume and set `ADMIN_BREAKGLASS_PASSWORD` before the first boot, or you
will not be able to sign in as admin.

If you ever deploy over an existing, non-wiped database instead: migrations
apply in order, and a failed migration halts startup - restore the
pre-migrate `.bak-*` snapshot, or resolve the migration state manually with
`prisma migrate resolve`.

The Authentik OIDC application/provider for this app (issuer slug e.g.
`santa`) is created separately, outside this repo, at real-deploy time.
Until it exists, leave the `OIDC_*` variables unset and run
break-glass-only.

### Build and Deploy

```bash
npm run build
npm start
```

This app is self-hosted: a single Docker container with a mounted SQLite
volume is the supported deployment path - see "Deploy Notes (Docker)"
above. `npm run build && npm start` also works directly on a host with
Node.js installed (e.g. bare-metal or a VM), without Docker.

## Security Notes

- Break-glass admin password is checked with a constant-time comparison against `ADMIN_BREAKGLASS_PASSWORD` (env var only, no DB storage)
- Personal link tokens are randomly generated and unique
- No sensitive data is exposed to users
- Session data stored in browser sessionStorage (cleared on logout)

## Troubleshooting

### Database Connection Issues

SQLite is a single file - make sure the DATABASE_URL in `.env` points to a writable path (in Docker, the `/data` volume must be mounted and writable).

### Prisma Client Not Found

Run `npx prisma generate` to generate the Prisma Client.

### Port Already in Use

The app runs on port 3000 by default. Change it with:
```bash
npm run dev -- -p 3001
```

## Future Enhancements

Possible features to add:
- Email notifications when assignments are created
- Gift budget suggestions
- Mark gifts as purchased
- Historical assignments from previous years
- Family group management
- Image uploads for wishlist items

## License

This is a personal project for family use. Feel free to adapt it for your own needs!

## Support

For issues or questions, please check the code comments or create an issue in the repository.
