# Worker

Eigener Workspace und kompilierbarer Einstiegspunkt. Start schlägt bewusst mit Exitcode 1 fehl, solange Queue, Jobautorisierung und Runner-Anbindung fehlen. Keine Hintergrundaufträge und keine OpenTofu-Ausführung implementiert.

Ziel: Queue, Scheduler und Dispatcher als eigener CF-Prozess; Terraform-Läufe ausschließlich in isolierten Runnern.

`src/plans/summary.ts` enthält die getestete wertfreie Auswertung eines gespeicherten
OpenTofu-Plans. Sie zählt Aktionen/Drift/Checks und erlaubt keinen Apply. Ein echter
lokaler Engine-Vertragstest ist über `npm run test:plan` im App-Workspace verfügbar;
siehe [Plan-Ausführung](../../../docs/plan-execution.md). Der Worker bleibt bis zur
Implementierung von Backend, Queue und isoliertem Runner bewusst nicht startfähig.
