# Railway configuration

`railway.ts` is the source-controlled Railway infrastructure definition. The
retired `railway.json` configuration is intentionally absent.

Use Railway CLI 5.42.1 or newer. Link the `goalflow` project, select each
persistent environment, inspect the plan, and apply it separately:

```sh
railway environment staging
railway config plan
railway config apply

railway environment production
railway config plan
railway config apply
```

Before the first deployment, define these shared variables independently in
each environment:

- `APP_ORIGIN`
- `OWNER_USER_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `BACKUP_MASTER_KEY`

The staging values must point only to staging Supabase and the production
values only to production Supabase. Never give a secret/server key a `VITE_`
name.

The definition maps staging to `develop` and production to `main`. Enable the
GitHub deployment trigger for staging only. Keep production's GitHub trigger
disabled and deploy it through the explicit release action after `beta-gate`
succeeds for the exact `main` commit being promoted.

The web service is promoted only when `/api/v1/health/ready` returns 200. The
maintenance function invokes the one-shot backup command at 02:00 UTC and must
exit nonzero when any user backup or retention operation fails.
