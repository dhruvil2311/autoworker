# Contributing to Autoworker

Thank you for your interest in contributing to Autoworker / Ghost Retail Worker. This document outlines our development workflows, quality standards, and contribution processes.

---

## 1. Repository Layout

Autoworker is an npm monorepo structured into applications and internal packages:

```
├── apps/
│   ├── api/             # Express REST API, auth middleware, workflow compiler
│   ├── desktop-agent/   # Desktop computer execution bridge
│   ├── extension/       # Chrome Manifest V3 recording extension
│   ├── web/             # React operational dashboard & visualizer
│   └── worker/          # Playwright-backed autonomous execution daemon
├── packages/
│   ├── bpi/                     # Business Process Intelligence models
│   ├── desktop-evidence-engine/ # Python FastMCP media & computer vision bridge
│   ├── observability/           # Structured, sanitized logging engine
│   ├── oir/                     # Operational Intermediate Representation (DAGs, planners, critics)
│   ├── runtime/                 # Workflow DSL V2 runtime engine and capability executors
│   ├── security/                # Secret masking, PII detection, and SSRF prevention
│   ├── shared-types/            # Common TypeScript type definitions
│   ├── university/              # Knowledge Evolution System (KES) continuous learning
│   └── workflow-schema/         # Strict Zod schemas for workflow definitions
├── supabase/
│   └── migrations/      # Chronological PostgreSQL migrations and RLS policies
├── docs/                # Architecture, database, and development documentation
└── scripts/             # Local development, seeding, and diagnostic utilities
```

---

## 2. Prerequisites & Setup

- **Node.js**: `>= 20.11`
- **npm**: `>= 10.0`
- **Python**: `>= 3.10` (Optional: for FastMCP desktop evidence engine)

To set up your local workspace:
```bash
npm install
cp .env.example .env
npm run build:deps
```

---

## 3. Branching & Pull Request Guidelines

1. **Branch Naming**: Use descriptive branch names prefixed by change type:
   - `feat/feature-name`
   - `fix/bug-description`
   - `docs/documentation-update`
   - `refactor/clean-up`
2. **Commit Hygiene**: Write clear, concise commit messages explaining the *why* behind your changes.
3. **PR Description**: Include:
   - Summary of the problem solved.
   - Affected packages or applications.
   - Proof of testing (command outputs and test results).
   - If UI changes were made, attach relevant screenshots.

---

## 4. Code Quality & Pre-PR Checks

Before submitting a pull request, run the following verification checks:

```bash
# 1. Verify TypeScript types compile cleanly across all workspaces
npm run typecheck

# 2. Run the test suite
npm run test

# 3. Build all workspace applications and libraries
npm run build
```

Do not bypass or disable existing tests. If your change affects existing functionality, update the corresponding tests to reflect intentional contract updates.

---

## 5. Schema & Database Migration Requirements

If your pull request introduces or modifies database tables, columns, indexes, or RLS policies:
1. **Never edit an existing migration file**: All changes must be appended as a new timestamped SQL file in `supabase/migrations/` (format: `YYYYMMDDNNNN_description.sql`).
2. **Enforce Row-Level Security**: Every new tenant-scoped table must include `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` and appropriate access policies anchored to `tenant_id`.
3. **Foreign Keys**: Ensure all tenant relationships reference `organizations(id)` with `ON DELETE CASCADE`.
4. **Update Documentation**: Update `docs/DATABASE_AND_MIGRATIONS.md` with table details and policy rationale.
5. **Include Tests**: Add automated tests verifying that queries succeed for authorized tenant users and are denied for unauthenticated or cross-tenant users.

---

## 6. Reporting Issues

When reporting an issue, provide:
- A clear, descriptive issue title.
- Expected vs. actual behavior.
- Exact steps to reproduce the issue.
- Operating system and Node.js version.
- Relevant anonymized logs (ensure all secrets, URLs with tokens, and credentials are removed).
