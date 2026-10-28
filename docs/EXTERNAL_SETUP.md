# External Setup

## Supabase

What is required: Supabase project, Auth, Postgres database, service role key, anon key.

Why: authentication, tenant data storage, RLS enforcement.

Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.

Used by: `apps/api`, migrations.

Verify: run migrations and authenticate an API request with a real Supabase access token.

## Gemini (LLM Provider) or OPENROUTER API KEY(NVIDIA/NEMOTRON)

What is required: Gemini API key and model selection.

Why: optional structured workflow compilation and AI-assisted workflow refinement.

Environment variables: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_BASE_URL`.

Used by: `apps/api` compiler adapter, BPI provider, and worker semantic steps when configured.

Verify: compile a recording through the Gemini adapter and validate the returned workflow schema.

## Browserbase

What is required: API key and project ID.

Why: isolated remote browser sessions for production execution.

Environment variables: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`.

Used by: `apps/worker` remote browser adapter once implemented.

Verify: create a session, run a non-secret test workflow, and confirm cleanup behavior.

## Redis Or Managed Queue

What is required: queue endpoint.

Why: async compile/run jobs outside HTTP request lifecycle.

Environment variable: `REDIS_URL`.

Used by: `apps/api`, `apps/worker`.

Verify: enqueue a run job and observe worker processing.

