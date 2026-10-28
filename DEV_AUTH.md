# Development Authentication

This document outlines how authentication works during local development for the Ghost MVP.

## Credentials

By default, Ghost creates a permanent development user when you run the development server. You can use these credentials to log in to the Dashboard:

- **Email**: `admin@ghost.local`
- **Password**: `Ghost@123456`

*(These are test-only credentials and are automatically seeded into your local Supabase emulator).*

## Setup & Workflow

1. Ensure your local Supabase instance is running (`supabase start`).
2. Run `npm run dev` from the root directory.
3. The setup process will automatically invoke the `scripts/seed-dev-user.ts` script.
4. The script checks if the development user exists in your Supabase Auth database. If not, it creates the user.
5. Once the frontend (Dashboard) loads, you can sign in directly using the credentials above without manual signup.
6. The Dashboard uses genuine Supabase authentication (issuing real JWTs and Sessions), verifying full compatibility with production RLS policies and API middleware.

## Environment Variables

You can configure the development authentication flow using the following environment variables (typically set in your `.env` file):

- `DEV_AUTH_ENABLED` (default: `true`): Must be explicitly true to enable the development seeder.
- `DEV_ADMIN_EMAIL` (default: `admin@ghost.local`): The email used for the seeded development account.
- `DEV_ADMIN_PASSWORD` (default: `Ghost@123456`): The password used for the seeded development account.

## Security Notes & Production Behavior

The development seeder is strictly guarded against running in a production environment. 

1. **Production Lock**: If `NODE_ENV=production` or `APP_ENV=production`, the `seed-dev-user.ts` script immediately halts and exits successfully without connecting to the database.
2. **Environment Variable**: `DEV_AUTH_ENABLED` provides an additional toggle and defaults to false in production configurations.
3. **API Logic**: The `/api/v1/auth/dev/login` mock login endpoint (used exclusively by automated test runners) checks for `config.devAuthEnabled` and `NODE_ENV !== "production"`. It returns a `403 Forbidden` error if invoked in production.

Production authentication (Supabase, JWT validation, RLS, Organization Memberships) remains entirely unmodified and secure.
