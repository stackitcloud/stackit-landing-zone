import { type JsonValue, objectValue, textValue } from "@lzc/domain";
import { useState } from "react";
import { t } from "../i18n";

const issuer = "https://token.actions.githubusercontent.com";
const audience = "sts.accounts.stackit.cloud";
export function FederatedIdentityEditor({
  value,
  onChange,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const providers = Array.isArray(value) ? value : [];
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [name, setName] = useState("github-actions");
  const [error, setError] = useState("");
  const update = (index: number, patch: Record<string, JsonValue>) =>
    onChange(
      providers.map((provider, i) =>
        i === index ? { ...objectValue(provider), ...patch } : provider,
      ),
    );
  return (
    <section
      className="federation-editor"
      aria-label={t("Service-Account-Föderation")}
    >
      <h3>{t("Service-Account-Föderation für CI/CD")}</h3>
      <p>
        {t(
          "Optional: Eine externe Pipeline darf sich mit ihrem kurzlebigen OIDC-Token am Management-Service-Account der Landing Zone anmelden. Sie erhält dessen Berechtigungen. Für eine kleine Landing Zone und den aktuellen Configurator-Runner ist diese Komponente nicht erforderlich.",
        )}
      </p>
      <p className="info-banner">
        {t(
          "Dies konfiguriert Workload Identity Federation für Automatisierung, nicht die Anmeldung von Menschen am Configurator oder STACKIT-Portal. Die Accelerator-Konfiguration richtet weder einen Workflow noch einen Token-Austausch ein und entfernt keinen bestehenden Service-Account-Schlüssel.",
        )}
      </p>
      {providers.map((raw, index) => {
        const provider = objectValue(raw);
        const assertions = Array.isArray(provider.assertions)
          ? provider.assertions
          : [];
        const updateAssertion = (
          row: number,
          patch: Record<string, JsonValue>,
        ) =>
          update(index, {
            assertions: assertions.map((assertion, i) =>
              i === row ? { ...objectValue(assertion), ...patch } : assertion,
            ),
          });
        return (
          <section
            className="federation-rule"
            // biome-ignore lint/suspicious/noArrayIndexKey: Controlled list items have no IDs and are not reordered.
            key={index}
            aria-label={t("Vertrauensregel {{value0}}", { value0: index + 1 })}
          >
            <h4>{textValue(provider.name) || t("Neue Vertrauensregel")}</h4>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`federation-${index}-name`}>
                  {t("Name der Vertrauensregel")}
                </label>
                <input
                  id={`federation-${index}-name`}
                  value={textValue(provider.name)}
                  onChange={(event) =>
                    update(index, { name: event.target.value })
                  }
                />
                <p className="field-hint">
                  {t(
                    "Eindeutige Kennung im Accelerator. Änderungen an bestehenden Namen können einen Ersatz auslösen.",
                  )}
                </p>
              </div>
              <div className="field">
                <label htmlFor={`federation-${index}-issuer`}>
                  {t("Token-Aussteller (Issuer-URL)")}
                </label>
                <input
                  id={`federation-${index}-issuer`}
                  type="url"
                  value={textValue(provider.issuer)}
                  onChange={(event) =>
                    update(index, { issuer: event.target.value })
                  }
                />
                <p className="field-hint">
                  {t(
                    "Nur Tokens dieses vertrauenswürdigen OIDC-Ausstellers sollen akzeptiert werden.",
                  )}
                </p>
              </div>
            </div>
            <h4>{t("Welche Tokens dürfen verwendet werden?")}</h4>
            <p>
              {t(
                "Alle Bedingungen müssen zutreffen. „aud“ bezeichnet die Zielgruppe des Tokens; „sub“ grenzt die zugelassene Pipeline ein. Jeder Wert wird exakt verglichen, ohne Platzhalter.",
              )}
            </p>
            {!assertions.some(
              (a) => textValue(objectValue(a).item) === "aud",
            ) && (
              <p role="alert" className="validation-box">
                {t("Eine Bedingung für die Zielgruppe „aud“ ist erforderlich.")}
              </p>
            )}
            {assertions.map((rawAssertion, row) => {
              const assertion = objectValue(rawAssertion);
              const operator = textValue(assertion.operator);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: Assertions have no IDs; controlled inputs preserve the imported list order.
                <div className="federation-condition" key={row}>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={`federation-${index}-${row}-claim`}>
                        {t("Token-Merkmal (Claim)")}
                      </label>
                      <input
                        id={`federation-${index}-${row}-claim`}
                        list="federation-claims"
                        value={textValue(assertion.item)}
                        onChange={(event) =>
                          updateAssertion(row, { item: event.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`federation-${index}-${row}-operator`}>
                        {t("Vergleich")}
                      </label>
                      <select
                        id={`federation-${index}-${row}-operator`}
                        value={operator}
                        onChange={(event) =>
                          updateAssertion(row, { operator: event.target.value })
                        }
                      >
                        {operator !== "equals" && (
                          <option value={operator}>
                            {operator || t("Nicht gesetzt")}{" "}
                            {t("– importierter Wert")}
                          </option>
                        )}
                        <option value="equals">{t("Ist genau gleich")}</option>
                      </select>
                      {operator !== "equals" && (
                        <p className="field-hint">
                          {t(
                            "Der aktuelle STACKIT-Provider unterstützt nur „equals“. Der importierte Wert bleibt bis zu deiner Änderung erhalten.",
                          )}
                        </p>
                      )}
                    </div>
                    <div className="field">
                      <label htmlFor={`federation-${index}-${row}-value`}>
                        {t("Erwarteter Wert")}
                      </label>
                      <input
                        id={`federation-${index}-${row}-value`}
                        value={textValue(assertion.value)}
                        onChange={(event) =>
                          updateAssertion(row, { value: event.target.value })
                        }
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "Bedingung entfernen? Dies kann den erlaubten Zugriff erweitern.",
                          ),
                        )
                      )
                        update(index, {
                          assertions: assertions.filter((_, i) => i !== row),
                        });
                    }}
                  >
                    {t("Bedingung entfernen")}
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                update(index, {
                  assertions: [
                    ...assertions,
                    { item: "", operator: "equals", value: "" },
                  ],
                })
              }
            >
              {t("Bedingung hinzufügen")}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Diese Vertrauensregel aus der Konfiguration entfernen? Bereits bereitgestellte Zugänge ändern sich erst durch einen gesonderten Apply.",
                    ),
                  )
                )
                  onChange(providers.filter((_, i) => i !== index));
              }}
            >
              {t("Vertrauensregel entfernen")}
            </button>
          </section>
        );
      })}
      <datalist id="federation-claims">
        <option value="aud">{t("Zielgruppe")}</option>
        <option value="sub">{t("Identität der Pipeline")}</option>
        <option value="email">{t("E-Mail-Claim")}</option>
      </datalist>
      <details>
        <summary>{t("GitHub-Actions-Zugang hinzufügen")}</summary>
        <p>
          {t(
            "Beschränke den Zugang auf ein Repository und einen Branch. Dieser Vorschlag gilt für Jobs ohne GitHub Environment und ohne angepassten Subject-Claim. Jobs mit einem Environment benötigen eine eigene, exakt passende „sub“-Bedingung.",
          )}
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="federation-new-name">
              {t("Name der neuen Vertrauensregel")}
            </label>
            <input
              id="federation-new-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="federation-repository">
              {t("GitHub-Repository")}
            </label>
            <input
              id="federation-repository"
              placeholder="organisation/repository"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="federation-branch">
              {t("Zugelassener Branch")}
            </label>
            <input
              id="federation-branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </div>
        </div>
        <p>
          {t("Der Workflow muss ein OIDC-Token mit der Audience")}{" "}
          <code>{audience}</code>{" "}
          {t(
            "anfordern. Dies ist kein GitHub-Passwort oder persönliches Zugriffstoken.",
          )}
        </p>
        {error && <p role="alert">{t(error)}</p>}
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            if (
              !name.trim() ||
              providers.some(
                (provider) =>
                  textValue(objectValue(provider).name) === name.trim(),
              ) ||
              !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
              !branch.trim() ||
              /[\s:*?[\\^~]/.test(branch) ||
              branch.includes("..") ||
              branch.includes("@{") ||
              branch.endsWith("/")
            ) {
              setError(
                "Bitte einen eindeutigen Namen, ein Repository im Format organisation/repository und einen konkreten Branch ohne Platzhalter angeben.",
              );
              return;
            }
            onChange([
              ...providers,
              {
                name: name.trim(),
                issuer,
                assertions: [
                  { item: "aud", operator: "equals", value: audience },
                  {
                    item: "sub",
                    operator: "equals",
                    value: `repo:${repository}:ref:refs/heads/${branch}`,
                  },
                ],
              },
            ]);
            setError("");
          }}
        >
          {t("GitHub-Vertrauensregel übernehmen")}
        </button>
      </details>
      <details>
        <summary>{t("Anderen OIDC-Aussteller konfigurieren")}</summary>
        <p>
          {t(
            "Für erfahrene Anwender: Issuer, Audience und mindestens eine zusätzliche Eingrenzung müssen zum tatsächlichen Token deiner Pipeline passen. Der neue Entwurf ist vor dem Speichern zu vervollständigen.",
          )}
        </p>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            onChange([
              ...providers,
              {
                name: "",
                issuer: "",
                assertions: [
                  { item: "aud", operator: "equals", value: "" },
                  { item: "sub", operator: "equals", value: "" },
                ],
              },
            ])
          }
        >
          {t("Eigene Vertrauensregel hinzufügen")}
        </button>
      </details>
      <p className="field-hint">
        <a
          href="https://registry.terraform.io/providers/stackitcloud/stackit/0.114.0/docs/resources/service_account_federated_identity_provider"
          target="_blank"
          rel="noreferrer"
        >
          {t("STACKIT-Provider: Service-Account-Föderation")}
        </a>
      </p>
    </section>
  );
}
