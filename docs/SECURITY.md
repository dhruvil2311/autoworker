# Security

Implemented controls:

- Bearer-token authentication middleware.
- Tenant context is derived from server-side auth and the API stores scope its writes to the authenticated tenant.
- PostgreSQL RLS migration for tenant-owned tables is included.
- Workflow schema rejects unknown action types and arbitrary executable actions.
- Secret input detection replaces sensitive values with placeholders.
- Structured logger redacts common secret and PII patterns.
- URL safety validator blocks localhost, private ranges, metadata endpoints, unsupported protocols, and non-allowlisted domains.
- Destructive workflow steps pause for human approval in the worker baseline.
- CAPTCHA/MFA are handled as HITL pause conditions by policy, not bypassed.

Remaining controls:

- Real Supabase auth integration tests.
- Production secret manager.
- Screenshot redaction.
- Queue isolation.
- Browserbase lifecycle verification.
- Webhook signing implementation.

Technical privacy controls are not a claim of GDPR, CCPA, PCI, or SOC 2 compliance.

