import type { AnomalyPolicy } from "@ghost/workflow-schema";

const secretFieldPattern =
  /(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|cvv|cvc|card|otp|mfa|2fa|auth)/i;
const creditCardPattern = /\b(?:\d[ -]?){13,19}\b/g;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /\b(?:\+?\d{1,3}[\s.-])?(?:\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/g;
const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
const apiKeyPattern = /\b(?:sk|pk|ghp|xox[baprs]|AKIA)[A-Za-z0-9_-]{12,}\b/g;

export type FieldSignals = {
  type?: string;
  autocomplete?: string;
  name?: string;
  id?: string;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
};

export function isSensitiveField(signals: FieldSignals): boolean {
  const joined = [
    signals.type,
    signals.autocomplete,
    signals.name,
    signals.id,
    signals.label,
    signals.ariaLabel,
    signals.placeholder
  ]
    .filter(Boolean)
    .join(" ");
  return signals.type === "password" || secretFieldPattern.test(joined);
}

export function classifySecretPlaceholder(signals: FieldSignals): string {
  const joined = [signals.name, signals.id, signals.label, signals.ariaLabel, signals.placeholder].filter(Boolean).join("_");
  const normalized = joined.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (/API_KEY|TOKEN/.test(normalized)) return `{{SECRET:${normalized || "API_KEY"}}}`;
  if (/CARD|CVV|CVC|PAYMENT/.test(normalized)) return "{{SECRET:PAYMENT_TOKEN}}";
  if (/OTP|MFA|2FA/.test(normalized)) return "{{SECRET:ONE_TIME_CODE}}";
  return `{{SECRET:${normalized || "PASSWORD"}}}`;
}

export function sanitizeInputValue(value: string, signals: FieldSignals): { value?: string; value_placeholder?: string } {
  if (isSensitiveField(signals) || containsLikelyCreditCard(value) || apiKeyPattern.test(value)) {
    return { value_placeholder: classifySecretPlaceholder(signals) };
  }
  return { value };
}

export function redactText(value: string): string {
  return value
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(ssnPattern, "[REDACTED_GOV_ID]")
    .replace(creditCardPattern, (candidate) => (isLikelyCreditCard(candidate) ? "[REDACTED_PAYMENT]" : candidate))
    .replace(phonePattern, "[REDACTED_PHONE]")
    .replace(apiKeyPattern, "[REDACTED_SECRET]");
}

function containsLikelyCreditCard(value: string): boolean {
  return [...value.matchAll(creditCardPattern)].some((match) => isLikelyCreditCard(match[0]));
}

function isLikelyCreditCard(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export const redactSensitiveText = redactText;

export function sanitizeLogMetadata(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(sanitizeLogMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      secretFieldPattern.test(key) ? "[REDACTED_SECRET]" : sanitizeLogMetadata(nested)
    ])
  );
}

export function assertSafeNavigationUrl(rawUrl: string, allowedDomains: string[] = []): URL {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    throw new Error("Blocked private or metadata URL");
  }
  if (allowedDomains.length > 0 && !allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new Error("URL is outside workflow allowlist");
  }
  return url;
}

export function evaluateAnomalyPolicy(policy: AnomalyPolicy, actual: number): boolean {
  switch (policy.operator) {
    case ">":
      return actual > policy.threshold;
    case ">=":
      return actual >= policy.threshold;
    case "<":
      return actual < policy.threshold;
    case "<=":
      return actual <= policy.threshold;
    case "==":
      return actual === policy.threshold;
    case "!=":
      return actual !== policy.threshold;
    default:
      return false;
  }
}

export interface TaskPolicyRule {
  id: string;
  name: string;
  prohibitedPatterns: RegExp[];
  prohibitedOperations?: string[];
  prohibitedSelectors?: RegExp[];
  rationale: string;
}

export interface PolicyValidationViolation {
  stepId: string;
  ruleId: string;
  ruleName: string;
  reason: string;
}

export interface PolicyValidationResult {
  valid: boolean;
  violations: PolicyValidationViolation[];
}

export const STANDARD_TASK_POLICIES: Record<string, TaskPolicyRule[]> = {
  PRODUCT_RESEARCH: [
    {
      id: "NO_CART_ADDITION",
      name: "Prohibit Cart Addition",
      prohibitedPatterns: [
        /\b(?:add\s+to\s+cart|add-to-cart|addtocart)\b/i,
        /\b(?:add\s+to\s+basket|add-to-basket)\b/i,
        /\b(?:in\s+den\s+einkaufswagen)\b/i
      ],
      prohibitedSelectors: [
        /#add-to-cart-button/i,
        /input\[name\*=['"]submit\.add-to-cart['"]\]/i,
        /button:has-text\(['"]Add to Cart['"]\)/i
      ],
      rationale: "Product research task is strictly read-only. Adding items to cart is prohibited."
    },
    {
      id: "NO_PURCHASE_OR_CHECKOUT",
      name: "Prohibit Purchasing, Checkout, and Payment",
      prohibitedPatterns: [
        /\b(?:buy\s+now|buynow)\b/i,
        /\b(?:proceed\s+to\s+checkout|checkout)\b/i,
        /\b(?:place\s+(?:your\s+)?order)\b/i,
        /\b(?:submit\s+payment|make\s+payment|enter\s+credit\s+card|pay\s+now)\b/i
      ],
      prohibitedSelectors: [
        /#buy-now-button/i,
        /input\[name\*=['"]submit\.buy-now['"]\]/i,
        /a\[href\*=['"]proceedToCheckout['"]\]/i
      ],
      rationale: "Financial transactions, checkout, and purchasing are strictly prohibited during research workflows."
    }
  ]
};

export function checkStepAgainstPolicy(step: any, rules: TaskPolicyRule[]): PolicyValidationViolation[] {
  const violations: PolicyValidationViolation[] = [];
  const textToCheck = [
    step.description,
    step.id,
    step.operation,
    step.args?.selector,
    step.args?.value,
    step.args?.instruction,
    step.args?.url,
    JSON.stringify(step.args || {})
  ].filter(Boolean).join(" ");

  const selector = step.args?.selector || "";

  for (const rule of rules) {
    for (const pat of rule.prohibitedPatterns) {
      if (pat.test(textToCheck)) {
        violations.push({
          stepId: step.id,
          ruleId: rule.id,
          ruleName: rule.name,
          reason: `Step '${step.id}' matches prohibited pattern ${pat}: ${rule.rationale}`
        });
        break;
      }
    }

    if (selector && rule.prohibitedSelectors) {
      for (const selPat of rule.prohibitedSelectors) {
        if (selPat.test(selector)) {
          violations.push({
            stepId: step.id,
            ruleId: rule.id,
            ruleName: rule.name,
            reason: `Step '${step.id}' uses prohibited selector '${selector}': ${rule.rationale}`
          });
          break;
        }
      }
    }
  }

  return violations;
}

export function validateWorkflowPolicies(rootStep: any, rules: TaskPolicyRule[]): PolicyValidationResult {
  const violations: PolicyValidationViolation[] = [];

  const visit = (step: any) => {
    if (!step) return;
    violations.push(...checkStepAgainstPolicy(step, rules));
    if (Array.isArray(step.children)) {
      step.children.forEach(visit);
    }
  };

  visit(rootStep);

  return {
    valid: violations.length === 0,
    violations
  };
}
