# Deployment & database migrations

Pushing to `main` does two things automatically:

1. **Vercel** builds and deploys the app (as before).
2. **GitHub Actions** (`.github/workflows/supabase-migrations.yml`) applies any new files from
   `supabase/migrations/` to the Supabase database. Nobody pastes SQL into Supabase.

## One-time setup (about 2 minutes)

Only the owner of the GitHub repo can do this. It is a secret, so it cannot live in the code.

1. Supabase dashboard -> your project -> **Connect** -> **Session pooler** -> copy the URI. It looks like
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Replace `[YOUR-PASSWORD]` with the database password (Project Settings -> Database -> reset it if unknown).
   Use the *session pooler* (not "Direct connection"): GitHub's servers cannot reach the direct host.
2. GitHub -> repo **kaal-vastr-v2** -> **Settings -> Secrets and variables -> Actions -> New repository secret**
   Name `SUPABASE_DB_URL`, value = the URI from step 1.
3. Push to `main`. Open the **Actions** tab: "Apply Supabase migrations" should go green.
   (You can also press *Run workflow* there at any time.)

If the secret is missing the job fails with a clear message and nothing is changed.

## What the migration job does

`scripts/apply-supabase-migrations.sh` uses the Supabase CLI (`db push`) and works on both kinds of database:

* **Brand-new database** - applies every migration in order and records them.
* **Existing database with no migration history** (set up earlier, tables already there) - the original
  migrations (older than `20261113100000`) are recorded as already applied, and only the newer ones run.
* **Existing database that is already tracked** - applies only what is new.

Every migration added for barcode billing is safe to run again (`IF NOT EXISTS` / `CREATE OR REPLACE`), and nothing
deletes or rewrites existing sales, products or stock.

Migrations that matter now:

| File | What it does |
|---|---|
| `20261113100000_barcode_inventory.sql` | variants, permanent barcodes, print history, Stock In + Scan checkout functions |
| `20261122090000_ensure_variant_columns.sql` | adds `variant` to `sales` and `products` if missing (fixes `column "variant" of relation "sales" does not exist`), refreshes the API schema cache |
| `20261122090100_split_payments_scan_checkout.sql` | Scan Billing checkout accepts split payments (e.g. Cash + UPI) |

The repository already created `sales.variant` in `20260718141829`; the error only appears on a database that never
received that migration. The new migration repairs such a database and does nothing on a healthy one.

## Order of events on a push

Vercel and the migration job start at the same moment. Migrations take seconds, but the new screens can be live a
moment before they finish - if a page shows "function not found", wait a minute and refresh.

## Vercel build error about TanStack (CVE)

`@tanstack/start-server-core` 1.169.17 is blocked by Vercel. `package.json`, `package-lock.json` and `bun.lock` now resolve
it to 1.169.45 (with matching `@tanstack/react-start`, `react-router`, `router-plugin`). If Vercel ever blocks another version, run
`npm install @tanstack/react-start@latest @tanstack/react-router@latest @tanstack/router-plugin@latest`, then `bun install --lockfile-only`,
commit both lock files, and push. Do **not** set `DANGEROUSLY_DEPLOY_VULNERABLE_TANSTACK_START_XSS`.

## Running migrations by hand (optional)

```bash
SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' bash scripts/apply-supabase-migrations.sh
```
(needs the Supabase CLI and `psql` installed).
