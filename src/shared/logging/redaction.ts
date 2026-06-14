const sensitiveKeys = new Set([
  "password",
  "email",
  "phone",
  "contact_phone",
  "contact_email",
  "care_notes",
  "carenotes",
  "assessment_answers",
  "assessmentanswers",
  "income",
  "income_inputs",
  "incomeinputs",
  "care_urgency",
  "careurgency",
  "review_body",
  "reviewbody",
  "license_data",
  "licensedata",
  "notes",
  "token",
]);

const sensitiveFragments = ["email", "phone", "token", "password"];

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? "[redacted]" : redactSensitive(entry),
      ]),
    );
  }
  return value;
}

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return sensitiveKeys.has(normalized) || sensitiveFragments.some((fragment) => normalized.includes(fragment));
}
