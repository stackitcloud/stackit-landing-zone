import { z } from "zod";
import type { Dialogue } from "./dialogue.js";

// Closed, reviewed boundaries are rendered by the application. A model selects
// relevant facts with current-turn evidence; it cannot rewrite their meaning.
export const architectureAdviceSelections = z
  .array(
    z.strictObject({
      fact: z.enum([
        "git-instance-topology",
        "application-git",
        "state-coordination",
      ]),
      quote: z.string().min(1).max(1200),
    }),
  )
  .max(3)
  .default([])
  .describe(
    "Select reviewed factual advice only when the CURRENT USER asks about that boundary: git-instance-topology for managed Git user capacity, maximum instance size or multi-instance topology; application-git for optional Git in Application templates or its SNA/private reachability; state-coordination for conditional S3 writes, locking and CLI versus Configurator concurrency. Copy a nonempty exact current USER quote establishing the question. Advice only; not a setup/change instruction, other service, old history or generic field enumeration. Otherwise []. These facts are rendered by the application; do not generate an alternative implementation or workaround.",
  );

const facts = {
  "git-instance-topology": {
    topic: "devops-git",
    en: "Git10 (git-10) supports up to 10 Git users; Git100 (git-100) supports up to 100 users per instance. A single instance cannot serve more than 100 users. The Accelerator's root devops object creates one central Git instance. For more users, divide teams or projects across independent Application Git instances, or evaluate another supported architecture. Application templates use git.enabled, git.flavor and git.acl; central Git uses devops.git_flavor and devops.allowed_network_ranges. Multiple instances provide neither automatic user distribution nor federation, shared repositories or a shared user directory. Decide the ownership and user partition before provisioning. Source-IP ACLs control access to public managed endpoints; project placement does not make them SNA-private. This is advice; nothing has been changed or deployed.",
    de: "Git10 (git-10) unterstützt bis zu 10, Git100 (git-100) bis zu 100 Git-Nutzer pro Instanz. Eine einzelne Instanz kann nicht mehr als 100 Nutzer bedienen. Das Root-Objekt devops des Accelerators erstellt eine zentrale Git-Instanz. Für mehr Nutzer Teams oder Projekte auf unabhängige Application-Git-Instanzen aufteilen oder eine andere unterstützte Architektur prüfen. Application-Templates nutzen git.enabled, git.flavor und git.acl; zentrales Git nutzt devops.git_flavor und devops.allowed_network_ranges. Mehrere Instanzen bieten weder automatische Nutzerverteilung noch Föderation, gemeinsame Repositories oder ein gemeinsames Nutzerverzeichnis. Verantwortung und Nutzeraufteilung vor der Bereitstellung festlegen. Quell-IP-ACLs schützen öffentliche managed Endpunkte; die Projektzuordnung macht sie nicht SNA-privat. Nur Beratung; nichts geändert oder deployt.",
  },
  "application-git": {
    topic: "project-templates",
    en: "An Application template can offer one optional managed STACKIT Git instance in its project. The Platform Owner controls git.enabled (default false), git.flavor and git.acl, either fixed or as bounded order choices. Enabling Git requires an explicit non-empty source-CIDR allowlist. Flavor IDs are git-10 (up to 10 users) and git-100 (up to 100 users per instance); display labels are not input values. Corporate/SNA placement does not make this endpoint private. Separate project instances partition users, not endpoint visibility; SNA or firewall rules cannot turn the managed public endpoint into a private service. Existing orders require a reviewed template/source upgrade. Provider 0.114.0 replaces Git on flavor or ACL changes; the Configurator rejects destructive Application upgrades, so repository/data migration needs a separate reviewed procedure. Git IAM permissions and Git-user onboarding are separate. No template, project or service has been changed.",
    de: "Ein Application-Template kann eine optionale verwaltete STACKIT-Git-Instanz im eigenen Projekt anbieten. Der Platform Owner steuert git.enabled (Standard false), git.flavor und git.acl fest oder als begrenzte Bestellauswahl. Aktivierung benötigt eine explizite, nicht leere Quell-CIDR-Freigabeliste. Flavor-IDs sind git-10 (bis 10 Nutzer) und git-100 (bis 100 Nutzer pro Instanz); Anzeigenamen sind keine Eingabewerte. Corporate/SNA macht den Endpunkt nicht privat. Getrennte Projektinstanzen teilen Nutzer auf, nicht die Sichtbarkeit; SNA- oder Firewall-Regeln machen den öffentlichen managed Endpunkt nicht zum privaten Service. Bestehende Bestellungen benötigen einen geprüften Template-/Quell-Upgrade. Provider 0.114.0 ersetzt Git bei Flavor-/ACL-Änderungen; der Configurator weist destruktive Application-Upgrades ab, deshalb ist eine separat geprüfte Repository-/Datenmigration nötig. Git-IAM-Rechte und Git-Nutzereinrichtung bleiben separat. Kein Template, Projekt oder Service wurde geändert.",
  },
  "state-coordination": {
    topic: "management-state",
    en: "Conditional writes are not enforced on the tested STACKIT EU01 S3 endpoint; use_lockfile=true does not establish mutual exclusion there. Standalone CLI/pipeline operation requires organizational single-writer discipline per State. The Configurator uses atomic PostgreSQL execution/dispatch reservations shared by all its API replicas and binds each physical S3 path to one logical State. Expired tickets do not prove that a Runner stopped; verified cleanup or reviewed recovery is required. Independent CLI writers and installations with separate databases are outside this coordination. The native S3 feature is requested, with no announced implementation date. This advice performs no execution or State changes.",
    de: "Der geprüfte STACKIT-EU01-S3-Endpunkt erzwingt keine bedingten Schreibzugriffe; use_lockfile=true stellt dort keinen gegenseitigen Ausschluss her. Standalone-CLI/Pipelines benötigen organisatorischen Einzelzugriff pro State. Der Configurator nutzt atomare PostgreSQL-Ausführungs-/Dispatch-Reservierungen gemeinsam über alle API-Replikate und bindet jeden physischen S3-Pfad an einen logischen State. Abgelaufene Tickets beweisen keinen gestoppten Runner; geprüfte Bereinigung oder freigegebene Recovery ist nötig. Unabhängige CLI-Schreiber und Installationen mit separaten Datenbanken sind nicht koordiniert. Die native S3-Funktion ist angefragt, ohne angekündigten Umsetzungstermin. Diese Beratung führt nichts aus und verändert keinen State.",
  },
} as const;

export function reviewedArchitectureAdvice(
  selections: z.infer<typeof architectureAdviceSelections>,
  message: string,
  language: "de" | "en",
  availableTopics: readonly string[],
): Dialogue | null {
  if (
    !selections.length ||
    selections.some(
      (selection) =>
        !message.includes(selection.quote) ||
        !availableTopics.includes(facts[selection.fact].topic),
    )
  )
    return null;
  const chosen = [
    ...new Set(selections.map((selection) => selection.fact)),
  ].map((id) => facts[id]);
  // Keep the same public response budget as all other dialogue paths.
  const explanation = chosen.map((fact) => fact[language]).join("\n\n");
  if (explanation.length > 3000) return null;
  return {
    explanation,
    questions: [],
    changes: [],
    references: [...new Set(chosen.map((fact) => fact.topic))],
  };
}
