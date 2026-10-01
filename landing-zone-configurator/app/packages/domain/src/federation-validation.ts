import {
  type DraftIssue,
  objectValue,
  textValue,
  type Values,
} from "./configuration.js";

// STACKIT provider 0.114.0 service_account_federated_identity_provider:
// aud is mandatory; equals is the only supported assertion operator.
// Keep parsing lossless: report errors at save/validation time, never rewrite imports.
export function federationIssues(values: Values): DraftIssue[] {
  const providers = values.federated_identity_providers;
  if (!Array.isArray(providers)) return [];
  const issues: DraftIssue[] = [];
  const names = new Set<string>();
  providers.forEach((raw, index) => {
    const provider = objectValue(raw);
    const path = `federated_identity_providers.${index}`;
    const name = textValue(provider.name);
    if (!name.trim() || name !== name.trim() || names.has(name))
      issues.push({
        field: `${path}.name`,
        message:
          "Jede CI/CD-Vertrauensregel benötigt einen eindeutigen Namen ohne äußere Leerzeichen.",
      });
    names.add(name);
    const issuer = textValue(provider.issuer);
    try {
      const url = new URL(issuer);
      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        issuer !== issuer.trim() ||
        url.hash
      )
        throw new Error();
    } catch {
      issues.push({
        field: `${path}.issuer`,
        message:
          "Bitte eine gültige HTTPS-URL des OIDC-Ausstellers ohne Zugangsdaten oder Fragment angeben.",
      });
    }
    const assertions = Array.isArray(provider.assertions)
      ? provider.assertions
      : [];
    if (!assertions.some((assertion) => objectValue(assertion).item === "aud"))
      issues.push({
        field: `${path}.assertions`,
        message:
          "Die CI/CD-Vertrauensregel muss eine Bedingung für die Token-Zielgruppe „aud“ enthalten.",
      });
    assertions.forEach((rawAssertion, row) => {
      const assertion = objectValue(rawAssertion);
      for (const field of ["item", "value"] as const)
        if (!textValue(assertion[field]).trim())
          issues.push({
            field: `${path}.assertions.${row}.${field}`,
            message:
              "Token-Merkmal und erwarteter Wert müssen ausgefüllt sein.",
          });
      if (assertion.operator !== "equals")
        issues.push({
          field: `${path}.assertions.${row}.operator`,
          message:
            "STACKIT unterstützt für diese Token-Bedingung ausschließlich den exakten Vergleich „equals“.",
        });
    });
  });
  return issues;
}
