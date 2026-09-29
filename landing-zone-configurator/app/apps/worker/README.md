# Worker

Eigener Workspace und kompilierbarer Einstiegspunkt. Start schlägt bewusst mit Exitcode 1 fehl, solange Queue, Jobautorisierung und Runner-Anbindung fehlen. Keine Hintergrundaufträge und keine OpenTofu-Ausführung implementiert.

Ziel: Queue, Scheduler und Dispatcher als eigener CF-Prozess; Terraform-Läufe ausschließlich in isolierten Runnern.
