import type { Template } from "@lzc/domain";
import { catalogue } from "@lzc/domain";

const descriptions: Record<
  string,
  { title: string; description: string; category: string }
> = {
  standalone: {
    title: "Standalone",
    description:
      "Eigenständige Projekte und Sandboxes ohne zentralen Netzwerk-Hub. Ein übersichtlicher Einstieg für deine erste Landing Zone.",
    category: "Einstieg",
  },
  "hub-and-spoke": {
    title: "Hub & Spoke",
    description:
      "Zentrale Konnektivität für gemeinsam vernetzte und eigenständige Projekte.",
    category: "Netzwerk",
  },
  "hub-and-spoke-firewall": {
    title: "Hub & Spoke mit Firewall",
    description:
      "Zentrales Netzwerk mit Firewall für die kontrollierte Kommunikation deiner Workloads.",
    category: "Sicherheit",
  },
  "hub-and-spoke-multi-area": {
    title: "Mehrere Netzwerkbereiche",
    description:
      "Getrennte Netzwerkbereiche für regulierte und gemeinsam genutzte Workloads.",
    category: "Netzwerk",
  },
  "hub-and-spoke-multi-region": {
    title: "Mehrere Regionen",
    description: "Regionale Netzwerk-Hubs und Landing Zones in eu01 und eu02.",
    category: "Regionen",
  },
  "hub-and-spoke-finance-research": {
    title: "Finance & Research",
    description:
      "Eigene Bereiche für Finanzanwendungen und Forschungsprojekte.",
    category: "Organisation",
  },
  "hub-and-spoke-prod-nonprod-firewall": {
    title: "Produktion & Entwicklung",
    description:
      "Getrennte Umgebungen für Produktion, Test und Entwicklung mit Firewall.",
    category: "Sicherheit",
  },
  "hub-and-spoke-tenant-isolation": {
    title: "Mandantentrennung",
    description:
      "Getrennte Netzwerkbereiche und Projekte für mehrere Mandanten.",
    category: "Organisation",
  },
};
export const templates: Template[] = [...catalogue.templates].sort((a, b) =>
  a.id === "standalone"
    ? -1
    : b.id === "standalone"
      ? 1
      : a.id.localeCompare(b.id),
);
export function describe(template: Template) {
  return (
    descriptions[template.id] ?? {
      title: template.id,
      description: "Vorlage aus dem Accelerator-Repository.",
      category: "Vorlage",
    }
  );
}

const standalone = templates.find((t) => t.id === "standalone");
if (!standalone) throw new Error("Required standalone template is missing");
export const standaloneTemplate: Template = standalone;
