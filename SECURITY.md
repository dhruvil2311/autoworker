# Security Policy & Responsible Disclosure

## 1. Security Overview

Autoworker / Ghost Retail Worker is designed with defense-in-depth principles across all layers:
- Multi-tenant isolation enforced via PostgreSQL Row-Level Security (RLS).
- Strict validation of workflow schemas rejecting arbitrary executable scripts.
- Secret and credential masking in structured logs and runtime traces.
- SSRF prevention blocking access to local loopback addresses, private cloud IP ranges (e.g., AWS/GCP metadata endpoints), and unapproved URL schemes.
- Human-in-the-Loop (HITL) pause mechanisms for destructive actions, financial transactions, or unverified changes.

---

## 2. Reporting a Vulnerability

If you discover a potential security vulnerability within this repository, we appreciate your cooperation in practicing responsible disclosure:

1. **Do Not File Public Issues**: Please do not report security vulnerabilities through public GitHub issues, public pull requests, or public discussions.
2. **Private Reporting**:
   - Use GitHub's private vulnerability reporting feature on the repository: navigate to the **Security** tab and click **Report a vulnerability**.
   - If private vulnerability reporting is unavailable, contact the project maintainers directly through your designated private communication channel.
3. **What to Include in Your Report**:
   - A clear description of the vulnerability and its potential impact.
   - Exact steps, scripts, or network requests to reproduce the behavior in a local development environment.
   - Target versions, packages, or API endpoints affected.
   - Any proposed remediation, patches, or configuration changes.

We will acknowledge receipt of reports promptly and collaborate to investigate and resolve confirmed findings before any public disclosure.

---

## 3. Secret Management & Credential Safety

- **Strict Prohibition**: Never commit real API keys, Supabase service role keys, database passwords, private certificates, session cookies, or personal identifying information (PII) to version control.
- **Environment Isolation**: Always use `.env.example` as a template. Real credentials must only reside in your local `.env` file, which is permanently ignored by `.gitignore`.
- **Accidental Exposure Remediation**: If an active API key or database credential is ever accidentally committed or exposed in any environment, consider that credential immediately compromised. The credential **must be rotated immediately** with the corresponding service provider (Supabase, OpenRouter, Google, Browserbase). Updating `.gitignore` after an exposure does not neutralize the historical leak.

---

## 4. Tenant Isolation & Access Control Testing

Because Autoworker processes business-critical retail operations across multiple merchants, maintaining strict tenant boundaries is essential:
- Every tenant query must be explicitly scoped by `tenant_id` / `organization_id`.
- Automated tenant-isolation tests must pass before shipping changes:
  ```bash
  npm run test -w packages/runtime -- src/__tests__/isolation.e2e.test.ts
  ```
- Any PR that touches database schemas, RLS policies, or authentication middleware must include corresponding automated negative tests demonstrating that access is denied across tenant boundaries.
