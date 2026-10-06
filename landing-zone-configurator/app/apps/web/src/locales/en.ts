export const englishMessages: Record<string, string> = {
  "Application-Gruppen": "Application groups",
  Gruppenname: "Group name",
  "Gruppe anlegen": "Create group",
  Gruppe: "Group",
  "Gruppe wählen": "Choose group",
  "Automatisch verwaltet": "Automatically managed",
  "Gruppenmitgliedschaften geprüft": "Group memberships reviewed",
  "Mitgliedschaften speichern": "Save memberships",
  "Für Gruppen freigeben": "Make available to groups",
  "Für keine Application Owner freigegeben":
    "Not available to any Application Owners",
  "Freigaben dieser Template-Version": "Access to this template version",
  "Template-Freigaben geprüft": "Template access reviewed",
  "Freigaben speichern": "Save access",
  "Gruppenänderung gespeichert.": "Group change saved.",
  "Gruppenänderung fehlgeschlagen.": "Group change failed.",
  "Der S3-State stimmt nicht mit dem Bootstrap-Checkpoint überein. Die Migration bleibt gesperrt; keinen erneuten Apply starten.":
    "The S3 state does not match the bootstrap checkpoint. Migration remains blocked; do not start another Apply.",
  "Die offene Backend-Migration ist diesem Apply nicht eindeutig zugeordnet. Ein gesonderter State-Abgleich ist erforderlich.":
    "The pending backend migration is not uniquely bound to this Apply. Separate state reconciliation is required.",
  "Der Bootstrap- oder S3-State konnte nicht als gültiger State gelesen werden. Die Migration bleibt gesperrt.":
    "The bootstrap or S3 state could not be read as a valid state. Migration remains blocked.",
  "Die Ressourcen im Bootstrap-Checkpoint konnten nicht sicher ausgewertet werden.":
    "The resources in the bootstrap checkpoint could not be safely inspected.",
  "Für diesen Apply ist kein prüfbarer Bootstrap-Checkpoint verfügbar. Aktualisiere den Ausführungsstatus.":
    "No inspectable bootstrap checkpoint is available for this Apply. Refresh execution status.",
  "Die Checkpoint-Prüfung ist in dieser Umgebung nicht verfügbar.":
    "Checkpoint inspection is not available in this environment.",
  "Der gespeicherte S3-Zugang konnte nicht gelesen werden. Die Migration bleibt gesperrt.":
    "The stored S3 credentials could not be read. Migration remains blocked.",
  "Das zugeordnete S3-Backend ist nicht verfügbar. Die Migration bleibt gesperrt.":
    "The assigned S3 backend is unavailable. Migration remains blocked.",
  "Der Arbeitsbereich wurde geändert. Lade die Seite neu und prüfe den Checkpoint erneut.":
    "The workspace changed. Reload the page and inspect the checkpoint again.",
  "Der Server konnte die Checkpoint-Prüfung nicht abschließen. Der bestehende State bleibt gesichert.":
    "The server could not complete checkpoint inspection. The existing state remains retained.",
  "Die Checkpoint-Antwort konnte nicht sicher ausgewertet werden. Lade die Seite neu; keinen erneuten Apply starten.":
    "The checkpoint response could not be safely validated. Reload the page; do not start another Apply.",
  "Recovery-Abgleich": "Recovery reconciliation",
  "S3-Abgleich": "S3 verification",
  Übereinstimmend: "Matching",
  "S3-State-Serial": "S3 state serial",
  "Lineage erhalten": "Lineage preserved",
  "S3-Prüfstand": "S3 snapshot",
  "Backend-Migration bestätigen": "Confirm backend migration",
  "Ich habe den S3-Abgleich geprüft und bestätige die Umstellung auf diesen S3-State ohne erneuten Apply.":
    "I have reviewed the S3 verification and confirm switching to this S3 state without another Apply.",
  Ja: "Yes",
  Nein: "No",
  Vorhanden: "Available",
  "Nicht vorhanden": "Not available",
  Gesperrt: "Locked",
  "Apply-ID": "Apply ID",
  "Checkpoint prüfen": "Inspect checkpoint",
  "State-Version": "State version",
  "State-Serial": "State serial",
  "State-Lock": "State lock",
  Frei: "Free",
  "Offene Backend-Migration": "Pending backend migration",
  "Separater Recovery-State": "Separate recovery state",
  "Ersetzte Instanzen": "Deposed instances",
  "Der Checkpoint wurde geändert. Prüfe ihn erneut.":
    "The checkpoint changed. Inspect it again.",
  "Dieser Recovery-Fall benötigt einen gesonderten State-Abgleich.":
    "This recovery case requires a separate state reconciliation.",
  "Checkpoint-Prüfung oder Freigabe fehlgeschlagen.":
    "Checkpoint inspection or confirmation failed.",
  "Ich habe den Checkpoint geprüft und bestätige, dass der bestehende State unverändert erhalten bleibt.":
    "I have reviewed the checkpoint and confirm that the existing state will be retained unchanged.",
  "Erneute Planung freigeben": "Allow a new plan",
  "Neue Plans sind gesperrt, bis der fehlgeschlagene Apply und sein State geprüft und abgeglichen wurden.":
    "New plans are blocked until the failed apply and its state have been reviewed and reconciled.",
  "STACKIT-Organisationsnachweis": "STACKIT organization proof",
  "Configurator-Benutzer": "Configurator user",
  "STACKIT-E-Mail": "STACKIT email",
  "Noch kein STACKIT-Nachweis": "No STACKIT identity verified yet",
  "STACKIT-Nachweis abgelaufen": "STACKIT identity proof expired",
  "Der angemeldete STACKIT-Benutzer hat keinen Zugriff auf diese Organisation.":
    "The signed-in STACKIT user has no access to this organization.",
  "Die STACKIT-Berechtigungen dieses Benutzers konnten nicht gelesen werden.":
    "This user's STACKIT permissions could not be read.",
  "STACKIT hat eine unerwartete Berechtigungsantwort geliefert. Die Organisationsbindung bleibt gesperrt.":
    "STACKIT returned an unexpected permissions response. Organization binding remains blocked.",
  "STACKIT hat eine unerwartete Rollenantwort geliefert. Die Organisationsbindung bleibt gesperrt.":
    "STACKIT returned an unexpected roles response. Organization binding remains blocked.",
  "Der bestätigte STACKIT-Account gehört nicht zum angemeldeten Configurator-Benutzer. Bitte mit demselben Account bestätigen.":
    "The confirmed STACKIT account does not belong to the signed-in Configurator user. Confirm with the same account.",
  "Dieser STACKIT-Account gehört bereits zu einem anderen Configurator-Benutzer.":
    "This STACKIT account is already linked to another Configurator user.",
  "Der Arbeitsbereich wurde geändert. Lade die Seite neu und prüfe den Nachweis erneut.":
    "The workspace changed. Reload the page and check the proof again.",
  "Die Sitzung wurde geändert. Lade die Seite neu und prüfe den Nachweis erneut.":
    "The session changed. Reload the page and check the proof again.",
  "Der STACKIT-Nachweis ist abgelaufen. Bitte erneut prüfen.":
    "The STACKIT proof expired. Please check again.",
  "Die STACKIT-Bestätigung wurde abgelehnt. Bitte erneut prüfen.":
    "STACKIT confirmation was denied. Please check again.",
  "Nachweis prüfen": "Check proof",
  "STACKIT öffnen": "Open STACKIT",
  "Organisations-Owner-Rechte geprüft":
    "Organization owner permissions verified",
  "Organisationsbindung bestätigen": "Confirm organization binding",
  "Organisation verbinden": "Bind organization",
  "Der Organisationsnachweis konnte nicht geprüft werden.":
    "The organization proof could not be verified.",
  "Vollständige Organisations-Owner-Rechte sind nicht nachgewiesen.":
    "Full organization owner permissions have not been verified.",
  "Die Organisationsbindung wurde nicht bestätigt. Bitte den Nachweis erneut prüfen.":
    "The organization binding was not confirmed. Verify the proof again.",
  "Die Bereitstellungsrichtlinie dieser Bestellung stimmt nicht mit der veröffentlichten Version überein.":
    "The deployment policy of this order does not match the published version.",
  Bereitstellungsrichtlinie: "Deployment policy",
  "Direkte Bereitstellung": "Direct deployment",
  "Bereitstellung mit Freigabe": "Approval-required deployment",
  "Diese Template-Version wurde stillgelegt.":
    "This template version has been retired.",
  "Die Template-Version konnte nicht stillgelegt werden.":
    "The template version could not be retired.",
  "{{value0}} · Version {{value1}} stillgelegt.":
    "{{value0}} · Version {{value1}} retired.",
  " · Stillgelegt": " · Retired",
  Stillgelegt: "Retired",
  "Diese Template-Version für neue Bestellungen sperren":
    "Block this template version for new orders",
  "Version stilllegen": "Retire version",
  "{{value0}} (nicht freigegeben)": "{{value0}} (not allowed)",
  "{{value0}} (nicht im geladenen Katalog)":
    "{{value0}} (not in the loaded catalogue)",
  "{{value0}} Auswahlwerte": "{{value0}} choices",
  "nicht verfügbar; manuelle Eingabe bleibt möglich":
    "unavailable; manual input is still possible",
  "Eine bestehende Bereitstellung oder ein State-Backend benötigt den statefähigen Plan-Runner. Ein backendloser Erstplan ist gesperrt.":
    "An existing deployment or state backend requires the state-aware plan runner. Backend-free initial plans are blocked.",
  "Wähle eine veröffentlichte Template-Version. Eine Bestellung speichert einen Auftrag; Cloud-Ressourcen werden dabei nicht erzeugt.":
    "Select a published template version. Ordering saves a request; it does not create cloud resources.",
  ". Dies bestätigt keine Schreibrechte für Plan/Apply. Rechte können sich nach der Prüfung ändern.":
    ". This does not confirm write permissions for Plan/Apply. Permissions may change after verification.",
  "Lädt aktuelle Auswahlwerte mit deinem gespeicherten Zugang. Das Referenzprojekt wird für Git, Observability und IaaS verwendet; Optionen sind keine Zusage für Quoten oder Verfügbarkeit in später neu angelegten Projekten. Es werden keine Cloud-Ressourcen verändert.":
    "Loads current options using your saved credentials. The reference project is used for Git, Observability and IaaS; options do not guarantee quotas or availability in projects created later. No cloud resources are changed.",
  "Neue Standalone-Entwürfe markieren das Beispielprojekt ausdrücklich als Public (Korrektur für Accelerator-Issue #84). Organisations-ID und verantwortliche E-Mail-Adressen bitte durch eigene Angaben ersetzen. „Accelerator-Standard verwenden“ entfernt eine eigene Einstellung; es stellt nicht die Vorlage wieder her.":
    "New standalone drafts explicitly mark the example project as Public (correction for accelerator issue #84). Replace the organization ID and responsible email addresses with your own details. 'Use accelerator default' removes a custom setting; it does not restore the template.",
  "Stabile Zuordnung im Accelerator; Umbenennen ändert Ressourcenadressen.":
    "Stable identifier in the accelerator; renaming changes resource addresses.",
  "Diese vier Ordner strukturieren deine Organisation. Du kannst ihre Anzeigenamen ändern; die Zuordnung der Projekte bleibt erhalten. Auch leere Ordner werden angelegt.":
    "These four folders structure your organization. You can change their display names; project assignments are retained. Empty folders are also created.",
  "Alle Bedingungen müssen zutreffen. „aud“ bezeichnet die Zielgruppe des Tokens; „sub“ grenzt die zugelassene Pipeline ein. Jeder Wert wird exakt verglichen, ohne Platzhalter.":
    "All conditions must match. 'aud' identifies the token audience; 'sub' limits the allowed pipeline. Each value is matched exactly, without wildcards.",
  "für OpenTofu/Terraform. Änderungen bitte im Configurator vornehmen; manuelle tfvars-Änderungen werden nicht importiert.":
    "for OpenTofu/Terraform. Make changes in the configurator; manual tfvars changes are not imported.",
  "bei. Dies vergibt Configurator-Rollen; STACKIT-IAM-Berechtigungen werden nicht verändert.":
    "workspace. This assigns configurator roles; STACKIT IAM permissions are not changed.",
  "Als Platform Engineer definierst du hier Vorlagen für spätere Anwendungsprojekte. Application Owner wählen ein veröffentlichtes Application Landing Zone Template und geben bei der Bestellung den Projektnamen an; die verantwortliche Person muss aus ihrer verifizierten STACKIT-Identität kommen.":
    "As a Platform Engineer, define templates for future application projects here. Application Owners select a published Application Landing Zone Template and provide a project name when ordering; the responsible person must come from their verified STACKIT identity.",
  ". Dies ist keine Projektkennung; jedes spätere Projekt erhält eine eigene Identität.":
    ". This is not a project identifier; each future project receives its own identity.",
  "Diese Vorlage enthält Kubernetes-Namespace-Dienste aus der Accelerator-Vorlage. Sie bleiben als Entwurf erhalten; ihre spätere Zuordnung zu einem Plattform-Cluster und die Ausführung sind noch nicht freigegeben.":
    "This template contains Kubernetes namespace services from the accelerator template. They are retained as drafts; assignment to a platform cluster and execution are not yet approved.",
  "Kleinbuchstaben, Ziffern und Bindestriche; innerhalb dieser Konfiguration eindeutig.":
    "Lowercase letters, digits and hyphens; unique within this configuration.",
  ". Änderungen an Kürzel oder Umgebung können bestehende Ressourcen umbenennen oder ersetzen.":
    ". Changes to the prefix or environment may rename or replace existing resources.",
  "Ein Wert pro Zeile; beim Verlassen des Felds übernehmen.":
    "One value per line; applied when leaving the field.",
  "Referenz auf das eigene Projektnetz dieser Instanz. Die Adresse steht erst bei der Bereitstellung fest. STACKIT Observability filtert öffentliche Quelladressen; die Zuordnung zum wirksamen Egress ist noch nicht qualifiziert. Veröffentlichung und Ausführung dieser Verknüpfung bleiben gesperrt.":
    "Reference to this instance's own project network. Its address is known only during deployment. STACKIT Observability filters public source addresses; assignment to the effective egress is not yet qualified. Publishing and execution of this binding remain blocked.",
  "Stage wird bei Anlage ausgewählt. Sie beeinflusst Ressourcennamen; spätere Änderungen benötigen einen gesondert geprüften Update-Vorgang.":
    "Stage is selected during creation. It affects resource names; later changes require a separately reviewed update operation.",
  "Das Gateway ist der STACKIT-Endpunkt. Beide Tunnel erhalten eine Verfügbarkeitszone; ihre öffentlichen Adressen stehen erst nach einer Bereitstellung fest.":
    "The gateway is the STACKIT endpoint. Both tunnels receive an availability zone; their public addresses are known only after deployment.",
  "Das Routingverfahren eines bestehenden Gateways kann nicht nachträglich geändert werden. Ein Wechsel erfordert den Ersatz des Gateways; vor einer späteren Ausführung muss der Plan auf diese Auswirkung geprüft werden.":
    "An existing gateway's routing method cannot be changed. Changing it requires replacing the gateway; review this impact in the plan before any later execution.",
  "Name zum Wiederfinden deines Entwurfs; wird nicht als Ressourcenname verwendet.":
    "Name to identify your draft; not used as a resource name.",
  Sprache: "Language",
  Arbeitsbereiche: "Workspaces",
  "Arbeitsbereich wechseln": "Switch workspace",
  Konfigurationen: "Configurations",
  Konfiguration: "Configuration",
  "Konfiguration auswählen": "Select configuration",
  Vorbereitung: "Preparation",
  Plan: "Plan",
  Apply: "Apply",
  Verlauf: "History",
  "Plan-Historie": "Plan history",
  "Apply-Historie": "Apply history",
  "Weiter zu Plan": "Continue to Plan",
  "Weiter zu Apply": "Continue to Apply",
  "Neuen Plan erstellen": "Create new plan",
  "Neue Vorbereitung": "New preparation",
  "Plattform planen": "Plan platform",
  "Plattform anwenden": "Apply platform",
  "Gespeicherte Vorbereitung": "Saved preparation",
  "Vorbereitung auswählen": "Select preparation",
  "Bitte auswählen": "Please select",
  "Nicht gespeichert": "Not saved",
  "· Nicht gespeichert": "· Not saved",
  gespeichert: "saved",
  ausstehend: "pending",
  "wird geprüft": "checking",
  angewendet: "applied",
  abgelaufen: "expired",
  abgeschlossen: "completed",
  Unbekannt: "Unknown",
  "Vorbereitung:": "Preparation:",
  "Plan:": "Plan:",
  "Apply:": "Apply:",
  "State-Backend ·": "State backend ·",
  Bereitstellungsstatus: "Deployment status",
  "Ausführungsstatus aktualisieren": "Refresh execution status",
  "Plan- und Apply-Ausführungen": "Plan and Apply runs",
  "Freigegebenen Plan anwenden": "Apply approved plan",
  Abgelaufen: "Expired",
  "Unbekannter Status": "Unknown status",
  Anlegen: "Create",
  Ändern: "Update",
  Ersetzen: "Replace",
  Löschen: "Delete",
  "Daten lesen": "Read data",
  "Geänderte Ausgaben": "Changed outputs",
  "Änderungen geplant – nichts angewendet.":
    "Changes planned. Nothing applied.",
  "Keine Änderungen geplant.": "No changes planned.",
  "Aktionszahlen des freigegebenen Plans.":
    "Action counts from the approved plan.",
  "Plan prüfen und freigeben": "Review and approve plan",
  Zielorganisation: "Target organization",
  "Zielorganisation UUID bestätigen": "Confirm target organization UUID",
  "Änderungen und Zielorganisation geprüft":
    "Changes and target organization reviewed",
  "Löschungen und Ersetzungen ausdrücklich freigegeben":
    "Deletions and replacements explicitly approved",
  "Gültig bis": "Valid until",
  "Plan-Prüfsumme (SHA-256)": "Plan checksum (SHA-256)",
  "Sitzung abgelaufen. Bitte erneut anmelden und den Plan prüfen.":
    "Session expired. Sign in again and review the plan.",
  Brotkrumennavigation: "Breadcrumb navigation",
  Hauptnavigation: "Main navigation",
  Anwendungsnavigation: "Application navigation",
  Abmelden: "Sign out",
  Anmelden: "Sign in",
  "– importierter Wert": "– imported value",
  "· Aktiv": "· Active",
  "· Du": "· You",
  "· Mitglieder verwalten": "· Manage members",
  "· Mitgliederverwaltung": "· Member management",
  "· Revision": "· Revision",
  "· Standardregion": "· Default region",
  "· Version": "· Version",
  "· wird beim ersten Speichern angelegt": "· created on first save",
  "· Zielordner:": "· Target folder:",
  "* Pflichtfelder": "* Required fields",
  "+ Landing Zone hinzufügen": "+ Add landing zone",
  "+ Sandbox hinzufügen": "+ Add sandbox",
  "<Unternehmenskürzel>": "<company prefix>",
  "5-Minuten-Metriken aufbewahren (Tage)": "5-minute metric retention (days)",
  Abbrechen: "Cancel",
  "Abfrage-Zeitlimit": "Query timeout",
  Abfrageintervall: "Query interval",
  Abgebrochen: "Cancelled",
  Abgeschlossen: "Completed",
  "Abmelden fehlgeschlagen. Bitte erneut versuchen.":
    "Sign-out failed. Please try again.",
  "Accelerator auf GitHub ↗": "Accelerator on GitHub ↗",
  "Accelerator-Referenz": "Accelerator reference",
  "Accelerator-Revision": "Accelerator revision",
  "Accelerator-Standard": "Accelerator default",
  "Accelerator-Standard · Management-S3": "Accelerator default · Management S3",
  "Accelerator-Standard verwenden": "Use accelerator default",
  "Achtung: Dieser Plan löscht oder ersetzt Ressourcen. Daten können unwiederbringlich verloren gehen.":
    "Warning: this plan deletes or replaces resources. Data may be lost permanently.",
  "Adress- und Dienstgruppen": "Address and service groups",
  "Adressbereich offen": "Address range unspecified",
  "Adressbereiche (CIDR)": "Address ranges (CIDR)",
  "Adressübersetzung deaktivieren": "Disable address translation",
  Aktion: "Action",
  "Aktion bei nicht erreichbarem Partner": "Action when peer is unreachable",
  "Aktion beim Tunnelstart": "Tunnel startup action",
  "Aktion fehlgeschlagen.": "Action failed.",
  Aktiviert: "Enabled",
  Aktualisieren: "Refresh",
  Aktualisierungsintervall: "Refresh interval",
  "Aktuelle STACKIT-Produktoptionen sind derzeit nicht verfügbar.":
    "Current STACKIT product options are unavailable.",
  "Aktuellen Entwurf durch die gespeicherte Konfiguration ersetzen?":
    "Replace the current draft with the saved configuration?",
  "Aktuellen Entwurf speichern": "Save current draft",
  "Allgemeine Secret-Typen zulassen": "Allow generic secret types",
  "Als neue Kopie speichern": "Save as new copy",
  "Als neue Plattformkonfiguration übernehmen":
    "Use as new platform configuration",
  "Als Platform Engineer konfigurierst du zentrale Dienste und Application Landing Zone Templates. Konkrete Anwendungsprojekte entstehen später durch Bestellungen eines Application Owners.":
    "As a Platform Engineer, you configure shared services and Application Landing Zone Templates. Application projects are created later through orders placed by an Application Owner.",
  "Anderen OIDC-Aussteller konfigurieren": "Configure another OIDC issuer",
  "Änderung fehlgeschlagen.": "Change failed.",
  "Änderung gespeichert.": "Change saved.",
  "Änderungen angewendet": "Changes applied",
  "Änderungen übernimmt ein Platform Engineer mit Berechtigung zur Mitgliederverwaltung.":
    "Changes are made by a Platform Engineer authorized to manage members.",
  "Änderungen werden angewendet": "Applying changes",
  "anfordern. Dies ist kein GitHub-Passwort oder persönliches Zugriffstoken.":
    "request it. This is not a GitHub password or personal access token.",
  "Angaben bitte prüfen": "Please review the details",
  "Angewendete Plattform-Outputs und Zielordner geprüft":
    "Applied platform outputs and target folder reviewed",
  Anmeldecode: "Sign-in code",
  "Anmeldung derzeit nicht erreichbar.": "Sign-in is currently unavailable.",
  "Anmeldung erfolgreich · Organisation lesbar":
    "Signed in successfully · Organization readable",
  "Anmeldung erforderlich": "Sign-in required",
  "Anmeldung ist hier nicht eingerichtet.": "Sign-in is not configured here.",
  "Anmeldung konnte noch nicht abgebrochen werden.":
    "Sign-in could not yet be cancelled.",
  "Anmeldung und Organisationszugriff geprüft. Schreibrechte für ein Deployment sind damit noch nicht bestätigt.":
    "Sign-in and organization access verified. This does not yet confirm deployment write permissions.",
  Anzeigename: "Display name",
  "App-Zugriff auf Fork einrichten ↗": "Configure app access to fork ↗",
  "Application Landing Zone Template": "Application Landing Zone Template",
  "Application Landing Zone Template aus meinem Entwurf":
    "Application Landing Zone Template from my draft",
  "Application Landing Zone Template hinzufügen":
    "Add Application Landing Zone Template",
  "Application Landing Zone Template veröffentlichen":
    "Publish Application Landing Zone Template",
  "Application Landing Zone Template-Entwürfe":
    "Application Landing Zone Template drafts",
  "Application Landing Zone Template-Version":
    "Application Landing Zone Template version",
  "Application Landing Zone Templates": "Application Landing Zone Templates",
  "Application Landing Zones": "Application Landing Zones",
  "Für die aktuelle State-Version ist kein gültiger Plattformvertrag eines erfolgreichen Apply verfügbar. Es wurden keine State-Daten exportiert.":
    "No valid platform contract from a successful apply is available for the current state version. No state data was exported.",
  "Der aktuelle State konnte nicht sicher gelesen werden. Prüfe den Backend-Zugang und ausstehende Wiederherstellungsschritte. Es wurden keine State-Daten exportiert.":
    "The current state could not be read safely. Check backend access and outstanding recovery steps. No state data was exported.",
  Katalog: "Catalogue",
  Veröffentlichung: "Publication",
  Plattformanbindung: "Platform binding",
  Gruppen: "Groups",
  Kompatibilitätsimport: "Compatibility import",
  "Template-Entwürfe": "Template drafts",
  "Application Landing Zones werden geladen.":
    "Loading Application Landing Zones.",
  "Application Owner": "Application Owner",
  applicationPlatformContract: "applicationPlatformContract",
  "Apply abgeschlossen": "Apply completed",
  "Apply abgeschlossen. Cloud-Ressourcen wurden gemäß dem freigegebenen Plan verarbeitet.":
    "Apply completed. Cloud resources were processed according to the approved plan.",
  "Apply fehlgeschlagen": "Apply failed",
  "Apply ist fehlgeschlagen. Ressourcen können bereits verändert worden sein. Prüfe den Ausführungsstatus vor weiteren Aktionen.":
    "Apply failed. Resources may already have changed. Check execution status before taking further action.",
  "Apply ist für diesen Plan nicht vom Server freigegeben oder die Plan-Nachweise sind unvollständig.":
    "The server has not authorized Apply for this plan, or the plan evidence is incomplete.",
  "Apply ist gesperrt: Der Plan enthält keinen bestätigten Vollständigkeitsnachweis der Engine.":
    "Apply is blocked: the plan has no engine-confirmed completeness evidence.",
  "Apply ist in dieser Umgebung nicht aktiviert.":
    "Apply is not enabled in this environment.",
  "Apply ist in dieser Umgebung nicht verfügbar.":
    "Apply is unavailable in this environment.",
  "Apply läuft": "Apply in progress",
  "Apply startet ausschließlich nach Prüfung und ausdrücklicher Freigabe eines vom Server zugelassenen, gespeicherten Plans.":
    "Apply starts only after review and explicit approval of a saved plan authorized by the server.",
  "Apply verändert Cloud-Ressourcen in der angegebenen Zielorganisation.":
    "Apply changes cloud resources in the specified target organization.",
  "Apply-Nachweise": "Apply evidence",
  ARBEITSBEREICH: "WORKSPACE",
  "Arbeitsbereich anlegen": "Create workspace",
  "Arbeitsbereich erstellen": "Create workspace",
  "Arbeitsbereich löschen": "Delete workspace",
  "Arbeitsbereich wechseln? Nicht gespeicherte Änderungen am Entwurf gehen verloren.":
    "Switch workspace? Unsaved draft changes will be lost.",
  "Arbeitsbereiche werden geladen …": "Loading workspaces …",
  "Arbeitsbereiche, Organisationszuordnung und persönliche Rollen verwalten.":
    "Manage workspaces, organization assignments and personal roles.",
  "Arbeitsstand automatisch in diesem Browser merken · getrennt nach angemeldetem Konto. Dies ersetzt das Speichern im Fork nicht.":
    "Remember work in this browser automatically, separately for each signed-in account. This does not replace saving to the fork.",
  "Archiv gegen Änderungen und Löschung sperren":
    "Protect archive against modification and deletion",
  Art: "Type",
  "Art des Application Landing Zone Templates":
    "Application Landing Zone Template type",
  "Art des neuen Projekts": "New project type",
  "Audit-Protokollierung": "Audit logging",
  "Aufbewahrung (Tage)": "Retention (days)",
  "Aus dem geladenen STACKIT-Produktkatalog. Fehlende Bestandswerte werden nicht automatisch ersetzt.":
    "From the loaded STACKIT product catalogue. Existing values missing from the catalogue are not replaced automatically.",
  "Aus verifiziertem Kontext": "From verified context",
  "Ausführung fehlgeschlagen": "Execution failed",
  "Ausführung startet": "Starting execution",
  "Ausführungsstatus konnte nicht aktualisiert werden.":
    "Could not refresh execution status.",
  "Ausführungsstatus nicht verfügbar": "Execution status unavailable",
  Ausführungsverlauf: "Execution history",
  "Ausgabe folgen": "Follow output",
  "Ausgabe nicht verfügbar.": "Output unavailable.",
  "Ausgehende Adressübersetzung": "Outbound address translation",
  Ausgeschaltet: "Disabled",
  "ausgewählt ·": "selected ·",
  "Ausgewählter Service Account · S3-Zugang aus Management Secrets Manager":
    "Selected service account · S3 credentials from Management Secrets Manager",
  Auswahl: "Selection",
  "Authentication status unavailable": "Authentication status unavailable",
  Automatisch: "Automatic",
  "Automatisch bereitgestellte Projektdienste":
    "Automatically provisioned project services",
  "Automatisch nach erfolgreichem Bootstrap-Apply":
    "Automatically after successful bootstrap Apply",
  "Automatisch verknüpft": "Automatically linked",
  availabilityZones: "availabilityZones",
  Backend: "Backend",
  "Backend der Landing Zone": "Landing zone backend",
  "Backend registrieren": "Register backend",
  "Backend-Verwaltung erfordert die Rolle Platform Engineer.":
    "Backend management requires the Platform Engineer role.",
  "Backenddatei herunterladen": "Download backend file",
  "Bastion-Images": "Bastion images",
  bastionAvailabilityZones: "bastionAvailabilityZones",
  bastionImages: "bastionImages",
  bastionMachineTypes: "bastionMachineTypes",
  "Bedingung entfernen": "Remove condition",
  "Bedingung entfernen? Dies kann den erlaubten Zugriff erweitern.":
    "Remove condition? This may broaden authorized access.",
  "Bedingung hinzufügen": "Add condition",
  Beginn: "Start",
  "Bei Bestellung auswählbar": "Selectable when ordering",
  "Bei Bestellung nicht verifiziert": "Not verified when ordering",
  "Bei STACKIT bestätigen": "Confirm with STACKIT",
  "Beitreten und Arbeitsbereich öffnen": "Join and open workspace",
  Benutzer: "User",
  "Benutzer oder Dienstkonto": "User or service account",
  "Berechtigte Identitäten": "Authorized identities",
  Berechtigungen: "Permissions",
  "Beschränke den Zugang auf ein Repository und einen Branch. Dieser Vorschlag gilt für Jobs ohne GitHub Environment und ohne angepassten Subject-Claim. Jobs mit einem Environment benötigen eine eigene, exakt passende „sub“-Bedingung.":
    "Restrict access to one repository and branch. This suggestion applies to jobs without a GitHub Environment or customized subject claim. Jobs with an environment require their own exactly matching sub condition.",
  Beschreibung: "Description",
  "Bestätigung ausstehend": "Confirmation pending",
  "Bestehende Gesamtkonfiguration · konkrete Anwendungsprojekte bleiben für die Bestandsverwaltung erhalten.":
    "Existing complete configuration · Application projects are retained for managing existing resources.",
  "Bestehende Konfiguration: Diese Einträge sind konkrete Projekte, keine Application Landing Zone Templates. Sie bleiben unverändert, damit gespeicherte Konfigurationen und ihre Ressourcenadressen erhalten bleiben.":
    "Existing configuration: these entries are projects, not Application Landing Zone Templates. They remain unchanged to preserve saved configurations and resource addresses.",
  "Bestehender Entwurf: Alle Werte bleiben fest, bis du eine Eingabe ausdrücklich freigibst.":
    "Existing draft: all values stay fixed until you explicitly make an input configurable.",
  "Bestehendes S3-Backend registrieren": "Register existing S3 backend",
  Bestelldetails: "Order details",
  Bestellen: "Order",
  "Bestellung fehlgeschlagen. Ein erneuter Versuch verwendet denselben Bestellschlüssel.":
    "Order failed. Retrying uses the same order key.",
  "Bestellung gespeichert. Es wurden keine Cloud-Ressourcen erzeugt.":
    "Order saved. No cloud resources were created.",
  "Bestellung testen": "Test order",
  Bestellungen: "Orders",
  "Bestimmt die Größe des IPv4-Adressbereichs: /24 umfasst 256 Adressen, /25 umfasst 128, /26 umfasst 64. Je höher die Zahl, desto kleiner das Netz. Nicht alle Adressen stehen für VMs zur Verfügung. Leer lassen: STACKIT legt die Größe fest.":
    "Sets the IPv4 address range size: /24 contains 256 addresses, /25 contains 128, and /26 contains 64. Higher numbers mean smaller networks. Not all addresses are available to VMs. Leave empty to let STACKIT set the size.",
  Betrieb: "Operations",
  Betriebssystem: "Operating system",
  "Bezieht sich auf das Dateisystem des späteren Runners, nicht auf deinen Computer. Alternativ den öffentlichen Schlüssel hinterlegen.":
    "Refers to the future runner filesystem, not your computer. Alternatively, provide the public key.",
  "BGP wird durch das aktuelle Accelerator-Modul nicht unterstützt. Diese VPN-Einstellungen ersetzen keine allgemeine SNA-Routing-Tabelle.":
    "The current accelerator module does not support BGP. These VPN settings do not replace a general SNA routing table.",
  "Bitte eine gültige, eindeutige Kennung angeben.":
    "Please provide a valid, unique identifier.",
  "Bitte eine Kennung mit Buchstaben, Zahlen, Bindestrichen oder Unterstrichen angeben.":
    "Please use letters, digits, hyphens or underscores in the identifier.",
  "Bitte eine vorhandene SNA auswählen": "Please select an existing SNA",
  "Bitte einen Bereich wählen": "Please select an area",
  "Bitte einen eindeutigen Namen, ein Repository im Format organisation/repository und einen konkreten Branch ohne Platzhalter angeben.":
    "Please provide a unique name, a repository in organization/repository format, and a specific branch without wildcards.",
  "Bitte einen gespeicherten technischen STACKIT-Zugang auswählen.":
    "Please select saved technical STACKIT credentials.",
  "Bitte erneut anmelden und den Plan prüfen.":
    "Please sign in again and review the plan.",
  "Bitte erneut anmelden.": "Please sign in again.",
  "Bitte gib einen Namen mit höchstens 64 Zeichen an und prüfe den Entwurf.":
    "Please enter a name of at most 64 characters and review the draft.",
  "Bitte markiere und kopiere den Link aus dem Feld.":
    "Please select and copy the link from the field.",
  "Bitte melde dich an, um Konfigurationen zu speichern und zu öffnen. GitHub ist dafür nicht erforderlich.":
    "Please sign in to save and open configurations. GitHub is not required.",
  "Bitte melde dich an.": "Please sign in.",
  "Bitte melde dich erneut an.": "Please sign in again.",
  "Bitte melde dich erneut mit GitHub an.": "Please sign in again with GitHub.",
  "Bitte melde dich für Application Landing Zones an.":
    "Please sign in for Application Landing Zones.",
  "Bitte mit STACKIT anmelden und die Organisation dieses Tenants prüfen, bevor du einen Plattformvertrag freigibst.":
    "Please sign in with STACKIT and verify this tenant's organization before approving a platform contract.",
  "Bitte mit STACKIT für die Organisation dieses Tenants erneut anmelden.":
    "Please sign in again with STACKIT for this tenant's organization.",
  "Bitte oben anmelden, um deine Forks zu verbinden.":
    "Please sign in above to connect your forks.",
  "Bitte prüfe Benutzerkennung, Rollen und Organisations-ID.":
    "Please check the user identifier, roles and organization ID.",
  "Bitte prüfe Profilname, Organisations-ID und Schlüsseldatei.":
    "Please check the profile name, organization ID and key file.",
  "Bitte verbinde GitHub für diese Repository-Funktion.":
    "Please connect GitHub to use this repository feature.",
  "Bitte vervollständige die Konfiguration und speichere sie erneut.":
    "Please complete the configuration and save it again.",
  "Bitte vervollständige zuerst die Angaben im Editor.":
    "Please complete the editor details first.",
  "Bitte wähle ein bestehendes Mitglied über Rollen bearbeiten aus.":
    "Please select an existing member using Edit roles.",
  Bootstrap: "Bootstrap",
  Bucket: "Bucket",
  "button primary": "button primary",
  "button secondary": "button secondary",
  "button secondary card-button": "button secondary card-button",
  Cluster: "Cluster",
  "Cluster-Monitoring · STACKIT Observability":
    "Cluster monitoring · STACKIT Observability",
  "Cluster-Netzwerkanbindung": "Cluster network connection",
  "Commit auf GitHub ansehen ↗": "View commit on GitHub ↗",
  companyCode: "companyCode",
  Connectivity: "Connectivity",
  "Connectivity in der Standardregion": "Connectivity in the default region",
  "Connectivity je Region": "Connectivity per region",
  "Connectivity nach Region": "Connectivity by region",
  "Container-Abbild": "Container image",
  "Content-Type": "Content-Type",
  Corporate: "Corporate",
  "Das Application Landing Zone Template konnte nicht geändert werden.":
    "Could not update the Application Landing Zone Template.",
  "Das Backend konnte nicht registriert werden.":
    "Could not register the backend.",
  "Das gespeicherte Plan-Artefakt konnte nicht bestätigt werden. Erstelle und prüfe einen neuen Plan.":
    "Could not verify the saved plan artifact. Create and review a new plan.",
  "Das Plan-Ergebnis konnte nicht sicher ausgewertet werden.":
    "Could not safely evaluate the plan result.",
  "Das Plattformziel passt nicht zur Projektart und Region des Templates.":
    "The platform target does not match the template's project type and region.",
  "Das Profil wurde bereits entfernt oder ist nicht zugänglich.":
    "The profile has already been removed or is inaccessible.",
  "Das State-Backend konnte nicht geprüft werden. Bitte später erneut speichern. Dein Entwurf bleibt erhalten.":
    "Could not verify the state backend. Please try saving again later. Your draft is retained.",
  "Das Tageslimit von 20 Plänen ist erreicht.":
    "The daily limit of 20 plans has been reached.",
  "Das Template oder die Bestellung ist ungültig. Prüfe die freigegebenen Bestellwerte.":
    "The template or order is invalid. Check the configurable order values.",
  Datenbank: "Database",
  Datenbankrevision: "Database revision",
  Datenverschlüsselung: "Data encryption",
  "de-DE": "en-US",
  Deaktivieren: "Disable",
  Deaktiviert: "Disabled",
  "Debug-Bastion: Maschinentypen": "Debug bastion: machine types",
  "Debug-Bastion: öffentliche Images": "Debug bastion: public images",
  "Debug-Bastion: Verfügbarkeitszonen": "Debug bastion: availability zones",
  "Dein Browser erlaubt kein Zwischenspeichern dieser Einladung. Öffne den Einladungslink nach der Anmeldung bitte erneut.":
    "Your browser cannot temporarily store this invitation. Open the invitation link again after signing in.",
  "Dein Entwurf konnte nicht zwischengespeichert werden. Bitte lade ihn vor der Anmeldung herunter.":
    "Could not temporarily save your draft. Download it before signing in.",
  "Dein letzter Arbeitsstand wurde in diesem Browser wiederhergestellt. Änderungen bitte weiterhin im Fork speichern.":
    "Your last work was restored in this browser. Continue saving changes to the fork.",
  "Deine aktuelle Mitgliedschaft erlaubt diesen Zugriff nicht.":
    "Your current membership does not permit this access.",
  "Deine Forks": "Your forks",
  "Deine gespeicherten Zugänge": "Your saved credentials",
  "Deine GitHub-Freigabe ist abgelaufen oder widerrufen. Bitte erneut anmelden.":
    "Your GitHub authorization has expired or been revoked. Please sign in again.",
  "Deine Konfiguration wurde als JSON und tfvars gemeinsam im Fork gespeichert.":
    "Your configuration was saved to the fork as both JSON and tfvars.",
  "Deine Konfigurationen in diesem Arbeitsbereich.":
    "Your configurations in this workspace.",
  "Deine Organisation": "Your organization",
  "Deine Sitzung ist nicht mehr aktuell. Bitte lade die Seite neu.":
    "Your session is no longer current. Please reload the page.",
  DELETE: "DELETE",
  "Demo-Angebot bereitstellen": "Provide demo offering",
  "Demo-Arbeitslast": "Demo workload",
  "Demo-Metriken einlesen": "Ingest demo metrics",
  "Den aktuellen lokalen Entwurf durch die gespeicherte Konfiguration ersetzen?":
    "Replace the current local draft with the saved configuration?",
  "Den bisherigen Entwurf verwerfen und mit dieser Vorlage neu beginnen?":
    "Discard the current draft and start again with this template?",
  "Den Branch-Stand aktualisieren und deinen Entwurf als neue Kopie vorbereiten? Bestehende Konfigurationen werden nicht überschrieben.":
    "Refresh the branch and prepare your draft as a new copy? Existing configurations will not be overwritten.",
  Deployment: "Deployment",
  "Deployment vorbereiten": "Prepare deployment",
  "Deployment-Zugänge": "Deployment credentials",
  "Deployment-Zugänge verwalten": "Manage deployment credentials",
  Deployments: "Deployments",
  "Der Accelerator erstellt derzeit eine zusätzliche STACKIT Observability-Instanz im Cluster-Projekt und verbindet sie mit dem SKE-Monitoring. Dies ist kein Dienst im Kubernetes-Cluster. Die Wiederverwendung einer bestehenden oder zentral definierten Instanz wird in Issue #88 ergänzt. Anwendungsmetriken benötigen eine eigene Anbindung.":
    "The accelerator currently creates an additional STACKIT Observability instance in the cluster project and connects it to SKE monitoring. This is not a service inside the Kubernetes cluster. Reusing an existing or centrally defined instance is tracked in issue #88. Application metrics require a separate connection.",
  "Der Accelerator erstellt je SNA dieser Region ein VPN-Gateway und übernimmt dieselben Verbindungen für alle diese Gateways. Eine Auswahl einzelner SNAs wird derzeit nicht unterstützt.":
    "The accelerator creates a VPN gateway for each SNA in this region and uses the same connections for all gateways. Selecting individual SNAs is currently unsupported.",
  "Der Accelerator erzeugt je SNA eine WAN-Routing-Tabelle mit Systemrouten und einer Standardroute ins Internet. Corporate-Projekte mit Firewall erhalten eine eigene Tabelle mit Standardroute zur Firewall-LAN-IP bzw. HA-VIP.":
    "The accelerator creates a WAN routing table per SNA with system routes and a default internet route. Corporate projects with a firewall get a separate table with a default route to the firewall LAN IP or HA VIP.",
  "Der aktive Arbeitsbereich wurde in einem anderen Tab geändert. Bitte lade die Seite neu, bevor du Mitglieder bearbeitest.":
    "The active workspace changed in another tab. Reload the page before editing members.",
  "Der aktuelle STACKIT-Provider unterstützt nur „equals“. Der importierte Wert bleibt bis zu deiner Änderung erhalten.":
    "The current STACKIT provider supports only equals. The imported value is retained until you change it.",
  "Der Application-Dienst ist derzeit nicht erreichbar.":
    "The application service is currently unavailable.",
  "Der Arbeitsbereich oder die Sitzung wurde geändert. Bitte neu laden.":
    "The workspace or session changed. Please reload.",
  "Der Arbeitsbereich wurde erstellt, konnte aber nicht geöffnet werden. Wähle ihn in der Arbeitsbereichsliste.":
    "The workspace was created but could not be opened. Select it from the workspace list.",
  "Der Arbeitsbereich wurde gewechselt. Bitte lade die Seite neu.":
    "The workspace changed. Please reload the page.",
  "Der Branch wurde inzwischen verändert. Lade den gespeicherten Stand neu oder speichere deinen Entwurf nach dem Aktualisieren als neue Kopie.":
    "The branch changed. Reload the saved version or save your draft as a new copy after refreshing.",
  "Der Browser kann deinen Arbeitsstand nicht sichern. Bitte speichere Änderungen im Fork oder lade sie herunter.":
    "The browser cannot save your work. Save changes to the fork or download them.",
  "Der Configurator startet dabei kein Deployment.":
    "The configurator does not start a deployment.",
  "Der Download enthält die OpenTofu-/Terraform-Variablen als .tfvars. Beim Speichern im Fork entsteht zusätzlich ein JSON-Dokument, mit dem du die Konfiguration hier wieder bearbeiten kannst. Berechtigungen, Dienstverfügbarkeit und die tatsächliche Ressourcenplanung werden erst beim späteren Deployment geprüft.":
    "The download contains OpenTofu/Terraform variables as .tfvars. Saving to a fork also creates a JSON document for reopening the configuration here. Permissions, service availability and actual resource planning are checked during later deployment.",
  "Der Entwurf konnte nicht für die Weiterleitung gesichert werden.":
    "Could not save the draft for redirecting.",
  "Der Entwurf wurde zum Download bereitgestellt. Er ist noch nicht im Fork gespeichert.":
    "The draft is ready to download. It has not yet been saved to the fork.",
  "Der Fork wurde geändert. Erstelle eine neue Vorbereitung.":
    "The fork changed. Create a new preparation.",
  "Der Fork wurde seit deiner Auswahl verändert. Wähle die gespeicherte Konfiguration erneut aus.":
    "The fork changed since your selection. Select the saved configuration again.",
  "Der gespeicherte Schlüssel ist ungültig oder abgelaufen. Lege ein neues Profil an.":
    "The saved key is invalid or expired. Create a new profile.",
  "Der gespeicherte Schlüssel konnte nicht gelesen oder zugeordnet werden. Prüfe das Profil oder lege es neu an.":
    "The saved key could not be read or assigned. Check the profile or recreate it.",
  "Der gespeicherte Service Account konnte für diese Organisation nicht bestätigt werden.":
    "The saved service account could not be verified for this organization.",
  "Der Katalog für Application Landing Zones ist auf diesem Server noch nicht aktiviert.":
    "The Application Landing Zone catalogue is not yet enabled on this server.",
  "Der Katalog konnte nicht geladen werden.": "Could not load the catalogue.",
  "Der letzte Arbeitsbereich konnte nicht geladen werden.":
    "Could not load the last workspace.",
  "Der MVP-Plan unterstützt Public-Projekte mit lokalem Netz ohne Observability oder Namespace-Dienste.":
    "The MVP plan supports public projects with a local network and without Observability or namespace services.",
  "Der persönliche Zugang ist nicht mehr verfügbar.":
    "The personal credentials are no longer available.",
  "Der Plan enthält Löschungen oder Ersetzungen.":
    "The plan includes deletions or replacements.",
  "Der Plan ist abgelaufen. Erstelle und prüfe einen neuen Plan.":
    "The plan expired. Create and review a new plan.",
  "Der Plan ist nicht mehr aktuell. Erstelle und prüfe einen neuen Plan.":
    "The plan is no longer current. Create and review a new plan.",
  "Der Plan ist nicht mehr freigabefähig: abgelaufen, geändert oder bereits verwendet. Prüfe den Ausführungsstatus und erstelle bei Bedarf einen neuen Plan.":
    "The plan can no longer be approved: it expired, changed or was already used. Check execution status and create a new plan if needed.",
  "Der Plattformvertrag gehört zu einem anderen Arbeitsbereich.":
    "The platform contract belongs to another workspace.",
  "Der Plattformvertrag ist in diesem Arbeitsbereich nicht verfügbar.":
    "The platform contract is unavailable in this workspace.",
  "Der Plattformvertrag ist nicht verfügbar. Es wurden keine State-Daten exportiert.":
    "The platform contract is unavailable. No state data was exported.",
  "Der Plattformvertrag ist ungültig. Es wurden keine State-Daten exportiert.":
    "The platform contract is invalid. No state data was exported.",
  "Der Runner konnte nicht gestartet werden.": "Could not start the runner.",
  "Der Runner wurde aktualisiert. Erstelle und prüfe einen neuen Plan, bevor du Apply freigibst.":
    "The runner was updated. Create and review a new plan before approving Apply.",
  "Der S3-State ist nicht lesbar. Prüfe den Backend-Zugang.":
    "The S3 state is unreadable. Check the backend credentials.",
  "Der S3-State ist nicht lesbar. Prüfe Zugang und Berechtigungen.":
    "The S3 state is unreadable. Check credentials and permissions.",
  "Der Server erlaubt Apply für diesen Plan nicht.":
    "The server does not authorize Apply for this plan.",
  "Der Speicherpfad wurde außerhalb des Configurators verändert und kann nicht sicher verwendet werden.":
    "The storage path changed outside the configurator and cannot be used safely.",
  "Der State ist durch eine andere Ausführung gesperrt. Prüfe den Ausführungsstatus.":
    "The state is locked by another execution. Check execution status.",
  "Der State wurde geändert. Erstelle und prüfe einen neuen Plan.":
    "The state changed. Create and review a new plan.",
  "Der technische STACKIT-Zugang ist auf diesem Server noch nicht angebunden.":
    "Technical STACKIT credentials are not yet integrated on this server.",
  "Der vollständige Link wird nur jetzt angezeigt. Es wird keine E-Mail verschickt.":
    "The full link is shown only now. No email is sent.",
  "Der Workflow muss ein OIDC-Token mit der Audience":
    "The workflow must request an OIDC token with audience",
  "Der Zugang fehlt oder gehört nicht zu deinem Arbeitsbereich.":
    "The credentials are missing or belong to another workspace.",
  "Der Zugang ist gespeichert. STACKIT-Berechtigungen wurden noch nicht geprüft.":
    "The credentials are saved. STACKIT permissions have not yet been checked.",
  "Der Zugang wurde geändert. Erstelle eine neue Vorbereitung.":
    "The credentials changed. Create a new preparation.",
  "Der Zugang wurde zwischenzeitlich geändert oder gelöscht. Wähle ihn erneut aus.":
    "The credentials were changed or deleted. Select them again.",
  "Der Zugang zur Zielorganisation konnte nicht bestätigt werden.":
    "Could not verify access to the target organization.",
  "Der Zugriff auf den Fork wurde abgelehnt. Prüfe die GitHub-App-Installation.":
    "Access to the fork was denied. Check the GitHub App installation.",
  "Der zuletzt verwendete Arbeitsbereich konnte nicht geöffnet werden. Wähle einen verfügbaren Arbeitsbereich.":
    "Could not open the last workspace. Select an available workspace.",
  "Details anzeigen": "Show details",
  DevOps: "DevOps",
  "Diagnose-Bastion": "Diagnostic bastion",
  "Diagnose-Bastion für das private Cluster-Netz":
    "Diagnostic bastion for the private cluster network",
  "Die Accelerator-Vorlage Standalone enthält eine unvollständige Public-Markierung (#84). Wähle für das Beispielprojekt ausdrücklich „Public“, wenn du kein zentrales Netzwerk benötigst.":
    "The Standalone accelerator template has an incomplete public designation (#84). Explicitly select Public for the example project if you do not need a central network.",
  "Die Aktion konnte nicht abgeschlossen werden. Dein Entwurf bleibt erhalten.":
    "Could not complete the action. Your draft is retained.",
  "Die Aktion konnte nicht abgeschlossen werden. Dein Entwurf bleibt erhalten. Bitte erneut versuchen.":
    "Could not complete the action. Your draft is retained. Please try again.",
  "Die Aktion konnte nicht bestätigt werden. Aktualisiere den Status vor einem erneuten Start.":
    "Could not confirm the action. Refresh the status before starting again.",
  "Die Aktion konnte nicht bestätigt werden. Aktualisiere die Liste, bevor du es erneut versuchst.":
    "Could not confirm the action. Refresh the list before retrying.",
  "Die Aktion konnte nicht bestätigt werden. Aktualisiere die Liste. Unvollständige Profile kannst du löschen und neu anlegen.":
    "Could not confirm the action. Refresh the list. Incomplete profiles can be deleted and recreated.",
  "Die aktuelle Policy-Anbindung unterstützt nur die einzelne nichtregionale Firewall. Issue #65 verfolgt mehrere Appliances.":
    "The current policy integration supports only the single non-regional firewall. Multiple appliances are tracked in issue #65.",
  "Die Änderung konnte nicht übernommen werden.": "Could not apply the change.",
  "Die Änderung verletzt eine Mitgliedschaftsregel. Mindestens ein Platform Engineer muss die Mitgliederverwaltung behalten.":
    "The change violates a membership rule. At least one Platform Engineer must retain member-management permissions.",
  "Die Anmeldung ist abgelaufen. Bitte erneut anmelden.":
    "Sign-in expired. Please sign in again.",
  "Die App hat auf dieses Repository keinen Zugriff. Bitte Installation und Schreibrechte prüfen.":
    "The app cannot access this repository. Check its installation and write permissions.",
  "Die Ausführung benötigt Wiederherstellung. Ressourcen können bereits verändert worden sein. Kein erneutes Apply starten.":
    "The execution requires recovery. Resources may already have changed. Do not start another Apply.",
  "Die Ausgabe wurde wegen ihrer Größe begrenzt.":
    "The output was truncated because of its size.",
  "Die ausgewählte Datei enthält kein gültiges JSON.":
    "The selected file does not contain valid JSON.",
  "Die Backend-Angaben sind ungültig.": "The backend details are invalid.",
  "Die Backend-Datei stimmt nicht mit dem verifizierten State-Backend überein. Bitte den GitHub-Stand und die Backend-Bindung prüfen. Es wurde nichts überschrieben.":
    "The backend file does not match the verified state backend. Check the GitHub version and backend binding. Nothing was overwritten.",
  "Die Backend-Zuordnung stimmt nicht mehr. Erstelle eine neue Vorbereitung.":
    "The backend assignment no longer matches. Create a new preparation.",
  "Die Backenddatei konnte nicht geladen werden.":
    "Could not load the backend file.",
  "Die Bestellparameter sind noch nicht vollständig qualifiziert.":
    "The order parameters are not yet fully qualified.",
  "Die Datei muss einen gültigen STACKIT-Service-Account-Schlüssel mit privatem RSA-Schlüssel enthalten. Prüfe Format und Ablaufdatum.":
    "The file must contain a valid STACKIT service-account key with a private RSA key. Check its format and expiry date.",
  "Die Eingaben sind für Speichern und Exportieren vollständig. Dies ist noch kein Deployment-Plan.":
    "The inputs are complete for saving and exporting. This is not yet a deployment plan.",
  "Die Eingaben sind vollständig und formal gültig.":
    "The inputs are complete and formally valid.",
  "Die Einladung konnte nicht verarbeitet werden. Bitte prüfe die Anmeldung und versuche es erneut.":
    "Could not process the invitation. Check your sign-in and try again.",
  "Die Engine bestätigt die Vollständigkeit nicht ausdrücklich. Noch unbekannte Werte können erst bei der Ausführung aufgelöst werden.":
    "The engine does not explicitly confirm completeness. Values that are still unknown may only be resolved during execution.",
  "Die feste ACL durch eine Projektnetz-Verknüpfung ersetzen? Diese Verknüpfung ist noch nicht zur Ausführung freigegeben.":
    "Replace the fixed ACL with a project-network binding? This binding is not yet authorized for execution.",
  "Die festgehaltene Konfiguration konnte nicht bestätigt werden.":
    "Could not verify the recorded configuration.",
  "Die Freigabe wurde abgewiesen. Prüfe Plan-Prüfsumme und Zielorganisation.":
    "Approval was rejected. Check the plan checksum and target organization.",
  "Die gespeicherte Konfiguration wurde geändert. Wähle sie erneut aus und erstelle eine neue Vorbereitung.":
    "The saved configuration changed. Select it again and create a new preparation.",
  "Die gespeicherte Konfiguration wurde inzwischen geändert. Öffne den aktuellen Stand oder speichere deinen Entwurf als neue Kopie.":
    "The saved configuration changed. Open the current version or save your draft as a new copy.",
  "Die GitHub-Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.":
    "GitHub sign-in failed. Please try again.",
  "Die ID findest du in den Organisationsdetails im STACKIT Portal.":
    "Find the ID in the organization details in the STACKIT Portal.",
  "Die Identität wird bei der Instanziierung geprüft. Ein GitHub-Login ist keine STACKIT-Identität. Rollen aus dem Referenzprojekt benötigen im Zielprojekt eine entsprechende Rollendefinition.":
    "Identity is checked during instantiation. A GitHub login is not a STACKIT identity. Roles from the reference project require corresponding role definitions in the target project.",
  "Die Katalogauswahl konnte in diesem Browser nicht gespeichert werden.":
    "Could not save the catalogue selection in this browser.",
  "Die Kennung existiert bereits.": "The identifier already exists.",
  "Die Kennungen müssen zu den Netzwerkbereichen passen. Richtlinien für mehrere Appliances sind noch eingeschränkt.":
    "The identifiers must match the network areas. Policies for multiple appliances remain limited.",
  "Die Konfiguration ist für die Speicherung zu groß (maximal 1 MiB). Bitte aufteilen.":
    "The configuration is too large to save (maximum 1 MiB). Please split it.",
  "Die Konfiguration ist größer als 1 MiB und kann nicht gespeichert werden.":
    "The configuration exceeds 1 MiB and cannot be saved.",
  "Die Konfiguration wurde entfernt oder ist nicht zugänglich.":
    "The configuration was removed or is inaccessible.",
  "Die maximale Laufzeit wurde überschritten.":
    "The maximum runtime was exceeded.",
  "Die OpenTofu-Ausgabe ist momentan nicht verfügbar.":
    "OpenTofu output is currently unavailable.",
  "Die OpenTofu-Ausgabe konnte nicht bestätigt werden.":
    "Could not verify the OpenTofu output.",
  "Die Organisation ist derzeit nicht aktiv.":
    "The organization is currently inactive.",
  "Die Organisations-ID findest du im STACKIT Portal oder in deiner Konfiguration. Diese Prüfung verändert keine Cloud-Ressourcen.":
    "Find the organization ID in the STACKIT Portal or your configuration. This check does not change cloud resources.",
  "Die Organisationsverwaltung ist derzeit nicht verfügbar.":
    "Organization management is currently unavailable.",
  "Die Organisationsverwaltung ist derzeit nicht verfügbar. Bitte erneut anmelden oder später versuchen.":
    "Organization management is currently unavailable. Sign in again or try later.",
  "Die private Kubernetes-API ist vom aktuellen CF-Runner nicht nachweislich erreichbar. Siehe Issue #37.":
    "Reachability of the private Kubernetes API from the current CF runner has not been established. See issue #37.",
  "Die Rollen platform, landing_zones_public, landing_zones_corporate und sandboxes bestimmen die Projektzuordnung. Anzeigenamen sind frei wählbar.":
    "The platform, landing_zones_public, landing_zones_corporate and sandboxes roles determine project assignments. Display names can be chosen freely.",
  "Die Schlüsseldatei wird serverseitig geschützt abgelegt. Sie wird weder im Git-Repository gespeichert noch wieder angezeigt. Deine Anmeldung und technische STACKIT-Zugriffe verwenden getrennte Identitäten.":
    "The key file is securely stored on the server. It is neither stored in Git nor displayed again. Your sign-in and technical STACKIT access use separate identities.",
  "Die Sitzung ist nicht mehr aktuell. Bitte erneut anmelden und den Plan prüfen.":
    "The session is no longer current. Sign in again and review the plan.",
  "Die Sitzung ist nicht mehr gültig. Bitte lade die Seite neu.":
    "The session is no longer valid. Please reload the page.",
  "Die SNA wird im Bereich Netzwerk definiert und hier referenziert.":
    "The SNA is defined in the Network section and referenced here.",
  "Die State-Zuordnung konnte nicht bestätigt werden.":
    "Could not verify the state assignment.",
  "Die tfvars-Datei wurde außerhalb des Configurators geändert oder passt nicht mehr zum gespeicherten Entwurf. Prüfe den Stand in GitHub oder speichere deinen Entwurf als neue Kopie. Es wurde nichts überschrieben.":
    "The tfvars file changed outside the configurator or no longer matches the saved draft. Check the GitHub version or save your draft as a new copy. Nothing was overwritten.",
  "Die verifizierte Besteller-E-Mail hat sich geändert. Bitte eine neue Bestellung anlegen.":
    "The verified orderer's email address changed. Please create a new order.",
  "Die vier Ordnerrollen bestimmen die Projektzuordnung. Anzeigenamen und Zugriffsrechte können hier geändert werden. Ordnerbeschreibungen werden vom Accelerator derzeit nicht wirksam übernommen.":
    "The four folder roles determine project assignments. Display names and permissions can be changed here. Folder descriptions are not currently applied by the accelerator.",
  "Die Zielorganisation stimmt nicht mit der gespeicherten Vorbereitung überein. Prüfe die exakte Organisations-ID.":
    "The target organization does not match the saved preparation. Check the exact organization ID.",
  "Die zuletzt geöffnete Konfiguration ist nicht verfügbar. Wähle eine Konfiguration im Arbeitsbereich.":
    "The last opened configuration is unavailable. Select a configuration in the workspace.",
  "Dienst-Leistungsklasse": "Service plan",
  Dienstadresse: "Service address",
  "Dient zum Wiederfinden. Der Name ändert keine Cloud-Ressource.":
    "Used for identification. The name does not change a cloud resource.",
  "Dies konfiguriert Workload Identity Federation für Automatisierung, nicht die Anmeldung von Menschen am Configurator oder STACKIT-Portal. Die Accelerator-Konfiguration richtet weder einen Workflow noch einen Token-Austausch ein und entfernt keinen bestehenden Service-Account-Schlüssel.":
    "This configures Workload Identity Federation for automation, not human sign-in to the configurator or STACKIT Portal. The accelerator configuration does not set up a workflow or token exchange or remove an existing service-account key.",
  "Diese Ausführung kann Cloud-Ressourcen bereits verändert haben. Prüfe den Status vor weiteren Aktionen.":
    "This execution may already have changed cloud resources. Check the status before taking further action.",
  "Diese eigene Bestellung ist in diesem Arbeitsbereich nicht verfügbar.":
    "This personal order is unavailable in this workspace.",
  "Diese Einladung ist abgelaufen, widerrufen oder bereits verwendet. Bitte fordere eine neue Einladung an.":
    "This invitation expired, was revoked or was already used. Please request a new invitation.",
  "Diese Konfiguration enthält Komponenten, die der Erstbereitstellungsplan noch nicht unterstützt. Prüfe die Ausführungshinweise bei der Konfigurationsauswahl.":
    "This configuration contains components not yet supported by the initial deployment plan. Review the execution notes when selecting the configuration.",
  "Diese Konfiguration enthält Komponenten, die der Erstbereitstellungsplan noch nicht unterstützt. Wähle eine unterstützte Standalone-Konfiguration.":
    "This configuration contains components not yet supported by the initial deployment plan. Select a supported standalone configuration.",
  "Diese Konfiguration existiert bereits. Bitte den Stand neu laden.":
    "This configuration already exists. Please reload it.",
  "Diese Konfiguration nutzt die Standardregion aus den Grundlagen. Weitere Regionen benötigen eine ausdrückliche Migration auf regionale Accelerator-Module. Ein automatischer Wechsel könnte bestehende Ressourcenzuordnungen ändern und wird deshalb nicht durchgeführt.":
    "This configuration uses the default region from Basics. Additional regions require explicit migration to regional accelerator modules. Automatic switching could change existing resource assignments and is therefore not performed.",
  "Diese Konfiguration oder Template-Version wird vom Editor noch nicht unterstützt.":
    "This configuration or template version is not yet supported by the editor.",
  "Diese Mitgliedschaft entfernen? Der Zugriff auf den Arbeitsbereich endet damit.":
    "Remove this membership? This ends access to the workspace.",
  "Diese Template-Version benötigt einen freigegebenen Plattformvertrag.":
    "This template version requires an approved platform contract.",
  "Angewendete Plattform": "Applied platform",
  "Plattform wählen": "Select platform",
  "Plattform prüfen": "Check platform",
  "Apply-Lauf": "Apply run",
  "Die angewendete Plattform ist nicht mehr aktuell oder der Organisationsnachweis ist abgelaufen.":
    "The applied platform is no longer current or the organisation proof has expired.",
  "Die Plattformquelle hat sich geändert. Bitte erneut prüfen.":
    "The platform source has changed. Please check it again.",
  "Plattform konnte nicht geprüft werden.":
    "The platform could not be checked.",
  "Diese Template-Version ist in deinem Arbeitsbereich nicht verfügbar.":
    "This template version is unavailable in your workspace.",
  "Diese Übersicht ist keine erfolgreiche Verbindungsprüfung. Ein Gateway ohne Verbindungen stellt noch keine VPN-Verbindung her.":
    "This overview is not proof of a successful connection test. A gateway without connections does not establish a VPN connection.",
  "Diese Verbindungskennung ist bereits vorhanden.":
    "This connection identifier already exists.",
  "Diese Vertrauensregel aus der Konfiguration entfernen? Bereits bereitgestellte Zugänge ändern sich erst durch einen gesonderten Apply.":
    "Remove this trust rule from the configuration? Already deployed access changes only through a separate Apply.",
  "Diese Vorbereitung besitzt Plan-Nachweise und bleibt für deren Nachvollziehbarkeit erhalten.":
    "This preparation has plan evidence and is retained for traceability.",
  "Diesen Template-Entwurf entfernen? Es werden keine Cloud-Projekte gelöscht.":
    "Remove this template draft? No cloud projects will be deleted.",
  "Dieser Assistent erstellt die Konfiguration der STACKIT-Seite. Das entfernte VPN-Gerät muss separat eingerichtet werden. VPN-Deployments und die geschützte Anbindung der Pre-Shared Keys sind im gemeinsamen Editor noch nicht verfügbar.":
    "This wizard creates the STACKIT-side configuration. The remote VPN device must be configured separately. VPN deployments and protected pre-shared-key integration are not yet available in the shared editor.",
  "Dieser Benutzer ist noch nicht registriert. Bitte zuerst im Configurator anmelden und die persönliche Benutzerkennung teilen.":
    "This user is not registered yet. Sign in to the configurator first and share the personal user identifier.",
  "Dieser Bestellschlüssel gehört zu einer anderen Bestellung. Bitte den Bestellentwurf neu öffnen.":
    "This order key belongs to another order. Please reopen the order draft.",
  "Dieser Plan wurde bereits für Apply verwendet. Prüfe den Ausführungsstatus.":
    "This plan was already used for Apply. Check execution status.",
  "Dieses Backend ist bereits registriert.":
    "This backend is already registered.",
  "Dieses Profil wurde noch nicht vollständig gespeichert.":
    "This profile has not yet been saved completely.",
  "Dieses Repository ist kein beschreibbarer Fork des Accelerators.":
    "This repository is not a writable accelerator fork.",
  "DNS-Name": "DNS name",
  "DNS-Zonen": "DNS zones",
  "DNS-Zonen erstellen": "Create DNS zones",
  "Download fehlgeschlagen.": "Download failed.",
  "Du bearbeitest eine bestehende Gesamtkonfiguration mit konkreten Projekten. Sie bleibt zur Bestandsverwaltung erhalten. Neue Plattformkonfigurationen enthalten stattdessen Application Landing Zone Templates.":
    "You are editing an existing complete configuration with specific projects. It is retained for managing existing resources. New platform configurations contain Application Landing Zone Templates instead.",
  "Du bist bereits Mitglied. Bestehende Rollen werden durch eine Einladung nicht geändert.":
    "You are already a member. An invitation does not change existing roles.",
  "Du darfst die Mitglieder dieses Arbeitsbereichs nicht verwalten.":
    "You may not manage this workspace's members.",
  "Du darfst Einladungen in diesem Arbeitsbereich nicht verwalten.":
    "You may not manage invitations in this workspace.",
  "Du hast für diese Änderung keine Berechtigung. Lade die Seite neu, um aktuelle Rechte zu sehen.":
    "You are not authorized to make this change. Reload the page to see current permissions.",
  "Du hast in diesem Arbeitsbereich keinen Zugriff auf diese Konfiguration.":
    "You cannot access this configuration in this workspace.",
  "Du kannst höchstens 20 persönliche Profile speichern. Entferne zuerst nicht mehr benötigte Profile.":
    "You can save at most 20 personal profiles. Remove unused profiles first.",
  "Du trittst als @": "You are joining as @",
  "E-Mail-Adresse des in STACKIT registrierten Verantwortlichen für diese Sandbox.":
    "Email address of the person responsible for this sandbox, registered in STACKIT.",
  "E-Mail-Adresse des in STACKIT registrierten Verantwortlichen für dieses Projekt.":
    "Email address of the person responsible for this project, registered in STACKIT.",
  "E-Mail-Adresse des in STACKIT registrierten Verantwortlichen.":
    "Email address of the responsible person registered in STACKIT.",
  "E-Mail-Claim": "Email claim",
  "Editor verfügbar": "Editor available",
  "Eigene Bereiche für Finanzanwendungen und Forschungsprojekte.":
    "Separate areas for financial applications and research projects.",
  "Eigene Einstellung": "Custom setting",
  "Eigene Observability-Instanz in diesem Projekt, zusätzlich zum zentralen Plattformdienst. Accelerator-Standard: ausgeschaltet. Plan und Zugriffsnetze stehen unter den weiteren Projektdiensten.":
    "A dedicated Observability instance in this project, in addition to the central platform service. Accelerator default: disabled. The service plan and access networks are under additional project services.",
  "Eigene Projektrollen": "Custom project roles",
  "Eigene Secrets-Manager-Instanz in diesem Projekt. Accelerator-Standard: eingeschaltet.":
    "A dedicated Secrets Manager instance in this project. Accelerator default: enabled.",
  "Eigene Vertrauensregel hinzufügen": "Add custom trust rule",
  "Eigenes Projektnetz (noch nicht ausführbar)":
    "Own project network (not yet executable)",
  "Eigenständige Landing-Zone-Projekte aus dem nächsten Schritt. Public bedeutet hier keine automatische Freigabe ins Internet.":
    "Standalone landing-zone projects from the next step. Public does not automatically grant internet access here.",
  "Ein bisheriger Konfigurator-State muss zuerst explizit übernommen werden. Es wird kein neuer State angelegt.":
    "An existing configurator state must first be explicitly adopted. No new state will be created.",
  "Ein zugänglicher Arbeitsbereich mit diesem Namen und dieser Organisations-ID existiert bereits. Bitte wähle ihn in der Liste aus.":
    "An accessible workspace with this name and organization ID already exists. Please select it from the list.",
  "Eindeutige Kennung": "Unique identifier",
  "Eindeutige Kennung im Accelerator. Änderungen an bestehenden Namen können einen Ersatz auslösen.":
    "Unique accelerator identifier. Changing existing names can trigger replacement.",
  "Eindeutige Kennung:": "Unique identifier:",
  "Eine Bedingung für die Zielgruppe „aud“ ist erforderlich.":
    "An audience (aud) condition is required.",
  "Eine eigenständige virtuelle Maschine im SNA-Netz des Plattform-Clusters, kein Kubernetes-Pod. Im aktuellen Accelerator wird sie nur mit diesem Cluster-Projekt erstellt und benötigt dessen SNA-Anbindung. Ein unabhängig konfigurierbarer Bastion-Host wird in Issue #87 verfolgt. Sie stellt noch keinen Netzwerkzugang für den Configurator-Runner her.":
    "A standalone virtual machine in the platform cluster's SNA network, not a Kubernetes pod. The current accelerator creates it only with this cluster project and requires its SNA connection. An independently configurable bastion host is tracked in issue #87. It does not yet establish network access for the configurator runner.",
  "Eine leere feste ACL begrenzt den Zugriff nicht. Für eine Bestellauswahl gültige CIDRs in die erlaubten Werte aufnehmen. Keine automatische Freigabe bei einer fehlenden Netzwerkreferenz.":
    "An empty fixed ACL does not restrict access. Include valid CIDRs in allowed values for order-time selection. A missing network reference does not grant access automatically.",
  "Eine neue Plattformkonfiguration mit Application Landing Zone Templates anlegen? Der gespeicherte Altbestand bleibt unverändert. Dies migriert keine Cloud-Ressourcen und keinen State.":
    "Create a new platform configuration with Application Landing Zone Templates? The saved existing configuration remains unchanged. This does not migrate cloud resources or state.",
  "Eine Verbindung enthält zwei Tunnel zur Gegenstelle. Die Schlüssel werden später über eine geschützte Zugangsanbindung bereitgestellt und gehören nicht in diese Konfiguration.":
    "A connection contains two tunnels to the peer. Keys are supplied later through protected credential integration and do not belong in this configuration.",
  "Eingaben und Verknüpfungen": "Inputs and bindings",
  Eingeschaltet: "Enabled",
  "Einige Dateien können nicht angezeigt werden. Aktuell werden maximal 30 Konfigurationen dieser Template-Version unterstützt.":
    "Some files cannot be displayed. Currently, at most 30 configurations of this template version are supported.",
  "Einladung annehmen": "Accept invitation",
  "Einladung schließen": "Close invitation",
  "Einladung widerrufen": "Revoke invitation",
  "Einladung zu einem Arbeitsbereich": "Workspace invitation",
  "Einladungslink – jetzt kopieren": "Invitation link – copy now",
  "Einladungslink erstellen": "Create invitation link",
  "Einstellungen werden geladen …": "Loading settings …",
  Einstieg: "Getting started",
  Eintrag: "Entry",
  "Eintrag entfernen:": "Remove entry:",
  "Eintrag zu": "Entry for",
  Einträge: "Entries",
  "Einzelkonfiguration und SNA-Liste sind gleichzeitig gesetzt. Bitte die gewünschte Variante beibehalten und die andere ausdrücklich entfernen.":
    "Both the single configuration and SNA list are set. Keep the intended variant and explicitly remove the other.",
  "Einzelne Firewall-Konfiguration": "Single firewall configuration",
  Ende: "End",
  Endpoint: "Endpoint",
  "Entfernte Subnetze": "Remote subnets",
  Entrypoint: "Entrypoint",
  Entwicklung: "Development",
  "Entwicklungsstand · Cloud-Änderungen nur nach Apply-Freigabe":
    "Development version · Cloud changes only after Apply approval",
  Entwurf: "Draft",
  "Entwurf ·": "Draft ·",
  "Entwurf bearbeiten": "Edit draft",
  "Entwurf prüfen": "Review draft",
  "Entwurf prüfen →": "Review draft →",
  "Erklärung für Besteller:": "Explanation for orderers:",
  "Erstelle eine Plattformkonfiguration mit zentralen Diensten und Application Landing Zone Template-Entwürfen. Die Beispielprojekte der Accelerator-Vorlage werden zu Vorlagen, nicht direkt zu Anwendungsprojekten. Veröffentlichung und Bestellung folgen im Ansicht Application Landing Zones.":
    "Create a platform configuration with shared services and Application Landing Zone Template drafts. Accelerator example projects become templates, not application projects directly. Publishing and ordering follow in the Application Landing Zones view.",
  "Erstelle einen einmaligen Link, gültig für sieben Tage. Die Person meldet sich an und bestätigt den Beitritt. Teile den Link nur mit der gewünschten Person: Wer ihn besitzt, kann die gewählten Rollen erhalten.":
    "Create a single-use link valid for seven days. The person signs in and confirms joining. Share the link only with the intended person: anyone who has it can receive the selected roles.",
  "Erstelle zuerst einen Entwurf oder öffne eine gespeicherte Konfiguration.":
    "Create a draft first or open a saved configuration.",
  "Erstellt Kubernetes-Namespaces und zugehörige Dienste auf dem Plattform-Cluster für ausgewählte Landing-Zone-Projekte. Die Kennung wählt das Projekt. Regionale Clusterzuordnung ist noch eingeschränkt (#80).":
    "Creates Kubernetes namespaces and related services on the platform cluster for selected landing-zone projects. The identifier selects the project. Regional cluster assignment remains limited (#80).",
  "Erstellt STACKIT Observability im zentralen Management-Projekt. Diese Instanz wird derzeit nicht automatisch für das Cluster-Monitoring wiederverwendet (Issue #88). Der STACKIT Telemetry Router gehört separat zur Audit-Protokollierung.":
    "Creates STACKIT Observability in the central management project. This instance is not currently reused automatically for cluster monitoring (issue #88). STACKIT Telemetry Router belongs separately to audit logging.",
  "Erwarteter Wert": "Expected value",
  "Erweiterte Connectivity-Einstellungen": "Advanced connectivity settings",
  "Erweiterte Tunnel-Einstellungen": "Advanced tunnel settings",
  "Es läuft bereits ein Plan in deinem Arbeitsbereich.":
    "A plan is already running in your workspace.",
  "Export fehlgeschlagen.": "Export failed.",
  "Externe IP": "External IP",
  "Externe IP der Ersatz-Appliance": "External IP of the replacement appliance",
  "Externes Netz (CIDR)": "External network (CIDR)",
  "Fest vorgegeben": "Fixed value",
  "Fester Name der Observability-Instanz (optional)":
    "Fixed Observability instance name (optional)",
  "field shared-field": "field shared-field",
  "Finance & Research": "Finance & Research",
  "Firewall-Administrator": "Firewall administrator",
  "Firewall-Regeln": "Firewall rules",
  "Firewall-Zugang initialisieren": "Initialize firewall access",
  "Firewalls je Netzwerkbereich": "Firewalls per network area",
  "Fork bei GitHub erstellen ↗": "Create fork on GitHub ↗",
  "Forks aktualisieren": "Refresh forks",
  "Frei definierbare zusätzliche Tabellen sind kein aktuelles Root-Feature. Statische VPN-Routen werden je VPN-Verbindung konfiguriert. Inter-Region-Verbindungen entstehen nicht automatisch.":
    "Custom additional tables are not currently a root-module feature. Static VPN routes are configured per VPN connection. Inter-region connections are not created automatically.",
  "Freigabe fehlgeschlagen.": "Approval failed.",
  "Freigabe gesperrt. Prüfe den Ausführungsstatus und erstelle bei Bedarf einen neuen Plan.":
    "Approval blocked. Check execution status and create a new plan if needed.",
  "Freigegebener Plan": "Approved plan",
  "Freigegebener Plattformvertrag": "Approved platform contract",
  "Für alle Ordner gilt die unter Grundlagen angegebene technisch verantwortliche Person. Anzeigenamen ändern weder interne Kennungen noch Projektkürzel.":
    "The technical contact from Basics applies to all folders. Display names do not change internal identifiers or project prefixes.",
  "Für die vorhandene Backend-Datei fehlt die verifizierte Bindung. Bitte das bisherige State-Backend wieder zuordnen und gegebenenfalls den Recovery-Export sichern.":
    "The existing backend file has no verified binding. Reassign the previous state backend and preserve the recovery export if needed.",
  "Für diese Aktion benötigst du die Rolle Administrator oder Deployer.":
    "This action requires the Administrator or Deployer role.",
  "Für diese Verknüpfung zuerst ein lokales Projektnetz aktivieren.":
    "Enable a local project network first for this binding.",
  "Für erfahrene Anwender: Issuer, Audience und mindestens eine zusätzliche Eingrenzung müssen zum tatsächlichen Token deiner Pipeline passen. Der neue Entwurf ist vor dem Speichern zu vervollständigen.":
    "For experienced users: the issuer, audience and at least one additional restriction must match your pipeline's actual token. Complete the new draft before saving.",
  "Für Plattformkonfigurationen benötigst du die Rolle Platform Engineer.":
    "Platform configurations require the Platform Engineer role.",
  "Für Public-Projekte ist die öffentliche Egress-Adresse noch nicht qualifiziert. Ein lokales Projektnetz allein liefert keine nachgewiesene Quelladresse für die Observability-ACL.":
    "The public egress address for public projects is not yet qualified. A local project network alone does not provide a verified source address for the Observability ACL.",
  "Für spätere Instanzen fest vorgegeben.": "Fixed for future instances.",
  Gast: "Guest",
  Gateway: "Gateway",
  "Gateway- und Verbindungsoptionen": "Gateway and connection options",
  "Gateway-Unterstützung": "Gateway support",
  Gegenstellenadresse: "Peer address",
  "geladen. Bestehende Konfigurationswerte bleiben unverändert.":
    "loaded. Existing configuration values remain unchanged.",
  "Gemeinsame interne IP": "Shared internal IP",
  "Geplante Organisationsstruktur · keine Abfrage bestehender Ressourcen":
    "Planned organization structure · No existing resources queried",
  "Geprüft am": "Checked on",
  "Geprüftes Identitätsmerkmal": "Verified identity attribute",
  "Geschützte Deployment-Zugänge": "Protected deployment credentials",
  "Gespeicherte Konfiguration": "Saved configuration",
  "Gespeicherte Konfiguration aus der Datenbank löschen? Der aktuelle Entwurf bleibt erhalten.":
    "Delete the saved configuration from the database? The current draft is retained.",
  "Gespeicherte Konfiguration auswählen": "Select saved configuration",
  "Gespeicherte Konfiguration gelöscht. Der aktuelle Entwurf bleibt erhalten.":
    "Saved configuration deleted. The current draft is retained.",
  "Gespeicherte Konfiguration öffnen": "Open saved configuration",
  "Gespeicherte Konfiguration, Ziel und Zugang nachvollziehbar verbinden.":
    "Bind a saved configuration, target and credentials with traceable evidence.",
  "Gespeicherte Konfigurationen": "Saved configurations",
  "Gespeicherten Zugang wählen": "Select saved credentials",
  "Gesperrt · Kein Cloud-Plan ausgeführt": "Blocked · No cloud plan executed",
  GET: "GET",
  "Getrennte Netzwerkbereiche für regulierte und gemeinsam genutzte Workloads.":
    "Separate network areas for regulated and shared workloads.",
  "Getrennte Netzwerkbereiche und Projekt-Templates für verschiedene Bereiche innerhalb einer Organisation.":
    "Separate network areas and project templates for different areas within an organization.",
  "Getrennte Umgebungen für Produktion, Test und Entwicklung mit Firewall.":
    "Separate production, test and development environments with a firewall.",
  "Gib einen Profilnamen an und wähle eine JSON-Schlüsseldatei mit höchstens 24 KiB.":
    "Enter a profile name and select a JSON key file of at most 24 KiB.",
  Git: "Git",
  "Git-Leistungsklasse": "Git service plan",
  "Git-Service": "Git service",
  "Git-Version": "Git version",
  gitFlavors: "gitFlavors",
  "GitHub hat den Commit abgelehnt: mögliche parallele Änderung oder Branch-Regel. Dein Entwurf bleibt erhalten. Bitte den GitHub-Stand prüfen.":
    "GitHub rejected the commit: a concurrent change or branch rule may be responsible. Your draft is retained. Check the GitHub version.",
  "GitHub ist derzeit nicht verfügbar.": "GitHub is currently unavailable.",
  "GitHub verbinden": "Connect GitHub",
  "GitHub-Actions-Zugang hinzufügen": "Add GitHub Actions access",
  "GitHub-Anfrage läuft …": "GitHub request in progress …",
  "GitHub-Forks": "GitHub forks",
  "GitHub-Repository": "GitHub repository",
  "GitHub-Vertrauensregel übernehmen": "Use GitHub trust rule",
  "GitHubs Zugriffslimit ist erreicht. Bitte später erneut versuchen.":
    "GitHub's rate limit has been reached. Please try again later.",
  "Größte Präfixlänge": "Largest prefix length",
  Grundlagen: "Basics",
  "Gültigkeit (Stunden)": "Validity (hours)",
  "header-user account": "header-user account",
  Herkunft: "Source",
  "Hier sind noch keine optionalen Komponenten aktiviert.":
    "No optional components are enabled here yet.",
  "Hinterlege den STACKIT-Service-Account für deine späteren Deployments. Nur du kannst diese Profile in deinem Arbeitsbereich verwalten.":
    "Store the STACKIT service account for your later deployments. Only you can manage these profiles in your workspace.",
  hinzufügen: "add",
  "Hinzufügen:": "Add:",
  Hochverfügbarkeit: "High availability",
  "Hub & Spoke": "Hub & Spoke",
  "Hub & Spoke mit Firewall": "Hub & Spoke with firewall",
  "IaaS-Maschinentypen": "IaaS machine types",
  "IaaS-Zonen": "IaaS zones",
  "Ich bestätige: Zielorganisation und State-Zuordnung passen zur Landing Zone.":
    "I confirm: the target organization and state binding match the landing zone.",
  "Identität der Pipeline": "Pipeline identity",
  Identitätsaussteller: "Identity issuer",
  Identitätsbedingungen: "Identity conditions",
  "Im Fork speichern": "Save to fork",
  "Im gewählten S3-Backend fehlt der State. Starte für eine bestehende Landing Zone keinen Bootstrap.":
    "The selected S3 backend has no state. Do not bootstrap an existing landing zone.",
  "Im regionalen Modell müssen Landing-Zone-Projekte ihre Region ausdrücklich angeben. Eine Region kann zunächst ohne SNA vorbereitet werden.":
    "In the regional model, landing-zone projects must explicitly specify their region. A region can initially be prepared without an SNA.",
  "In einen anderen Fork wechseln? Der aktuelle Entwurf wird dort nur als neue Kopie gespeichert.":
    "Switch to another fork? The current draft will only be saved there as a new copy.",
  "info-banner legacy-copy-banner": "info-banner legacy-copy-banner",
  Initialisierung: "Initialization",
  "Installiere die GitHub-App auf dem gewünschten Fork mit „Only select repositories“. Danach hier die Forks aktualisieren. Die Fork-Erstellung bestätigst du direkt bei GitHub.":
    "Install the GitHub App on the desired fork using Only select repositories. Then refresh the forks here. Confirm fork creation directly on GitHub.",
  Instanz: "Instance",
  Instanziierungsvariable: "Instantiation variable",
  Integritätsverfahren: "Integrity algorithm",
  "Interne IP": "Internal IP",
  "Interne IP der Ersatz-Appliance": "Internal IP of the replacement appliance",
  "Interne Weiterleitung über externe Adresse":
    "Internal forwarding via external address",
  "Internes Netz (CIDR)": "Internal network (CIDR)",
  "Invalid connectivity contract": "Invalid connectivity contract",
  "IP-Version": "IP version",
  "Issue #": "Issue #",
  "Ist genau gleich": "Equals exactly",
  "Jede Region enthält ihre STACKIT Network Areas (SNAs) und die zugehörigen Connectivity-Dienste. Gleiche SNA-Kennungen verbinden Regionen nicht automatisch.":
    "Each region contains its STACKIT Network Areas (SNAs) and associated connectivity services. Matching SNA identifiers do not connect regions automatically.",
  Katalogregion: "Catalogue region",
  Katalogzugang: "Catalogue credentials",
  "Katalogzugang nicht verfügbar. Prüfe die gespeicherten Deployment-Zugänge im aktiven Arbeitsbereich.":
    "Catalogue credentials are unavailable. Check the saved deployment credentials in the active workspace.",
  "Kein aktueller Plan verfügbar. Erstelle und prüfe einen Plan.":
    "No current plan is available. Create and review a plan.",
  "Kein Application Landing Zone Template im aktuellen Entwurf.":
    "No Application Landing Zone Template in the current draft.",
  "Kein Entwurf in diesem Tab": "No draft in this tab",
  "Kein lesender Zugriff auf diese Organisation. Prüfe Organisations-ID und Service-Account-Berechtigungen.":
    "No read access to this organization. Check the organization ID and service-account permissions.",
  "Kein Netz": "No network",
  "Kein passendes Template gefunden": "No matching template found",
  "Kein Projektnetz": "No project network",
  "Kein Rollenkatalog geladen und keine eigene Projektrolle definiert.":
    "No role catalogue loaded and no custom project role defined.",
  "Kein VPN-Gateway konfiguriert.": "No VPN gateway configured.",
  "Kein zugängliches Referenzprojekt gefunden.":
    "No accessible reference project found.",
  "Keine Berechtigung für diese Ausgabe.":
    "You are not authorized to view this output.",
  "keine Einträge": "no entries",
  "Keine Einträge": "No entries",
  "Keine Gültigkeit bestätigt": "No validity confirmed",
  "Keine Konfigurationen gespeichert.": "No configurations saved.",
  "Keine offenen Einladungen.": "No pending invitations.",
  "Keine Projekte in dieser Konfiguration": "No projects in this configuration",
  "Keine Rollen für diesen Filter.": "No roles match this filter.",
  Kennung: "Identifier",
  "Kennung ändern": "Change identifier",
  "Kennung der neuen VPN-Verbindung": "New VPN connection identifier",
  "Kennung und zugehörige Namespace-Referenzen umbenennen?":
    "Rename the identifier and associated namespace references?",
  "Kennzeichnet den Einsatzzweck und ergänzt den Ressourcennamen: dev, test, staging oder prod.":
    "Indicates the purpose and extends the resource name: dev, test, staging or prod.",
  Kennzeichnungen: "Labels",
  "Kleinbuchstaben, Ziffern und Bindestriche. Jede Kennung darf nur einmal vorkommen.":
    "Lowercase letters, digits and hyphens. Each identifier must be unique.",
  "Kleinste Präfixlänge": "Smallest prefix length",
  Knotengruppen: "Node pools",
  "Komponente hinzufügen": "Add component",
  "Komponente hinzufügen in": "Add component to",
  "Konfiguration erstellen": "Create configuration",
  "Konfiguration in der Datenbank gespeichert.":
    "Configuration saved to the database.",
  "Konfiguration konnte nicht geladen werden.":
    "Could not load the configuration.",
  "Konfiguration prüfen": "Review configuration",
  "Konfiguration schließen:": "Close configuration:",
  "Konfiguration speichern": "Save configuration",
  "Konfiguration speichern →": "Save configuration →",
  "Konfiguration wechseln? Nicht gespeicherte Änderungen am Entwurf gehen verloren.":
    "Switch configuration? Unsaved draft changes will be lost.",
  "Konfiguration wird validiert": "Validating configuration",
  "Konfigurationen →": "Configurations →",
  "Konfigurationen in deinem Arbeitsbereich speichern und wieder öffnen.":
    "Save and reopen configurations in your workspace.",
  "Konfigurationen konnten nicht geladen werden. Bitte aktualisieren.":
    "Could not load configurations. Please refresh.",
  "Konfigurations-Commit": "Configuration commit",
  "Konfigurationsdaten ansehen": "View configuration data",
  Konfigurationsschritte: "Configuration steps",
  Konfigurieren: "Configure",
  Kontaktadresse: "Contact address",
  Kubernetes: "Kubernetes",
  "Kubernetes automatisch aktualisieren": "Update Kubernetes automatically",
  "Kubernetes-Dienstkonto": "Kubernetes service account",
  "Kubernetes-Namespace-Dienste": "Kubernetes namespace services",
  "Kubernetes-Namespace-Name": "Kubernetes namespace name",
  "Kubernetes-Speicherklasse": "Kubernetes storage class",
  "Kubernetes-Werkzeug installieren": "Install Kubernetes tool",
  "Kubernetes-Zugriff": "Kubernetes access",
  kubernetesVersions: "kubernetesVersions",
  "Landing Zone": "Landing Zone",
  "Landing Zone Configurator": "Landing Zone Configurator",
  "Landing Zone entfernen": "Remove landing zone",
  "Landing Zones": "Landing Zones",
  "Landing Zones bilden deine Workloads ab. Sandboxes bieten Platz zum Experimentieren.":
    "Landing zones represent your workloads. Sandboxes provide space for experimentation.",
  "Landing Zones mit zentraler Netzwerkanbindung. In Standalone bleibt dieser Ordner leer.":
    "Landing zones with a central network connection. This folder stays empty in standalone configurations.",
  "Landing-Zone-Projekte": "Landing-zone projects",
  "Laufwerksgröße (GB)": "Disk size (GB)",
  "Lege fest, was vorgegeben ist und was ein Application Owner bei der Bestellung auswählen darf. Alle weiteren Einstellungen, Region und SNA bleiben fest. Organisation und verantwortliche Person stammen später aus dem verifizierten Kontext.":
    "Specify fixed values and what an Application Owner may select when ordering. All other settings, the region and SNA remain fixed. The organization and responsible person come from the verified context later.",
  "Legt eine neue Konfiguration an.": "Creates a new configuration.",
  Leistungsklasse: "Service plan",
  "Leistungsplan und Verfügbarkeitszonen müssen in der gewählten Region verfügbar sein. Diese Produktkataloge werden hier noch nicht live abgefragt.":
    "The service plan and availability zones must be available in the selected region. These product catalogues are not yet queried live here.",
  "Lesbarer Name im Konfigurator, z. B. Kundenportal. Die Ressourcennamen entstehen aus den Kürzeln und der Umgebung.":
    "Readable name in the configurator, for example Customer portal. Resource names are derived from prefixes and the environment.",
  "Lesbarer Unternehmensname für die Konfiguration.":
    "Readable company name for the configuration.",
  Leseberechtigte: "Readers",
  "Link kopieren": "Copy link",
  "Link kopiert.": "Link copied.",
  "Lokal, ohne SNA": "Local, without SNA",
  "Lokale Adresse": "Local address",
  "Lokale Subnetze": "Local subnets",
  "Lokale Vorschau des späteren Bestellformulars. Es werden keine Ressourcen erstellt und keine Cloud-Zugriffe ausgeführt. Veröffentlichung und Bestellungen für Application Landing Zones folgen separat.":
    "Local preview of the future order form. No resources are created and no cloud access is performed. Publishing and ordering Application Landing Zones follow separately.",
  "Lokaler Entwurf": "Local draft",
  "Lokales Projektnetz anlegen": "Create local project network",
  machineImages: "machineImages",
  machineTypes: "machineTypes",
  Management: "Management",
  "Management und aktivierte Plattformdienste. Anzeigename: 1–40 Zeichen.":
    "Management and enabled platform services. Display name: 1–40 characters.",
  "Management-State-Bucket · Anlage im ersten Apply":
    "Management state bucket · Created during first Apply",
  Mandantentrennung: "Tenant isolation",
  Maschinentyp: "Machine type",
  "Maximal 100 Vorbereitungen. Entferne zuerst nicht mehr benötigte Einträge.":
    "At most 100 preparations. Remove unused entries first.",
  "Maximale Anzahl": "Maximum count",
  "Mehrere Netzwerkbereiche": "Multiple network areas",
  "Mehrere Netzwerkbereiche verwalten": "Manage multiple network areas",
  "Mehrere Regionen": "Multiple regions",
  "Melde dich an, um eigene Zugänge zu verwalten.":
    "Sign in to manage your credentials.",
  "Melde dich an, um einen Arbeitsbereich zu öffnen oder zu erstellen.":
    "Sign in to open or create a workspace.",
  "Melde dich oben an, um Deployments vorzubereiten. GitHub ist dafür nicht erforderlich.":
    "Sign in above to prepare deployments. GitHub is not required.",
  "Melde dich über die Schaltfläche oben an. Auch bei deiner ersten Anmeldung wird dein Benutzer automatisch angelegt. Danach kannst du die Einladung prüfen und bestätigen.":
    "Sign in using the button above. Your user is created automatically on first sign-in. You can then review and confirm the invitation.",
  "Metrikaufbewahrung (Tage)": "Metric retention (days)",
  Metrikpfad: "Metric path",
  Metrikquellen: "Metric sources",
  "Mindestens ein Mitglied muss die Mitgliederverwaltung behalten.":
    "At least one member must retain member-management permissions.",
  "Mindestversion von Kubernetes": "Minimum Kubernetes version",
  "Minimale Anzahl": "Minimum count",
  "Missing root element": "Missing root element",
  "Mit GitHub anmelden": "Sign in with GitHub",
  "Mit STACKIT anmelden": "Sign in with STACKIT",
  Mitglied: "Member",
  "Mitglied einladen": "Invite member",
  "Mitglied entfernen": "Remove member",
  "Mitglieder & Einstellungen": "Members & settings",
  "Mitglieder in": "Members in",
  "Mitglieder verwalten": "Manage members",
  "Mitgliedschaft speichern": "Save membership",
  Modus: "Mode",
  "muted empty-folder": "muted empty-folder",
  "muted topology-note": "muted topology-note",
  "Nach Treffer nicht weiter prüfen": "Stop checking after match",
  "Nächster Router über die Firewall": "Next router via firewall",
  Name: "Name",
  "Name der Ersatz-Appliance": "Replacement appliance name",
  "Name der Konfiguration": "Configuration name",
  "Name der neuen Vertrauensregel": "New trust rule name",
  "Name der Vertrauensregel": "Trust rule name",
  "Name des Arbeitsbereichs": "Workspace name",
  "Name des Templates": "Template name",
  "Name für das separate Projekt zum Experimentieren.":
    "Name for the separate experimentation project.",
  Namensauflösung: "Name resolution",
  Namenspräfix: "Name prefix",
  "Namenspräfix für Ressourcen:": "Resource name prefix:",
  namespaceServices: "namespaceServices",
  "nav-item active": "nav-item active",
  Netzgröße: "Network size",
  "Netzgröße (IPv4-Präfixlänge)": "Network size (IPv4 prefix length)",
  Netzwerk: "Network",
  "Netzwerk-Hub": "Network hub",
  Netzwerkbereich: "Network area",
  Netzwerkschnittstelle: "Network interface",
  Netzwerkschnittstellen: "Network interfaces",
  Netzwerkzuordnung: "Network assignment",
  "Neue eindeutige Kennung. Dies kann Ressourcenadressen ändern.":
    "New unique identifier. This may change resource addresses.",
  "Neue Kennung für": "New identifier for",
  "Neue Konfiguration": "New configuration",
  "Neue Kopie vorbereiten": "Prepare new copy",
  "Neue Landing Zone": "New landing zone",
  "Neue Sandbox": "New sandbox",
  "Neue Vertrauensregel": "New trust rule",
  "Neues Projekt": "New project",
  "nicht aktiviert": "not enabled",
  "Nicht gebunden": "Not bound",
  "Nicht gesetzt": "Not set",
  "nicht im geladenen Katalog": "not in the loaded catalogue",
  "nicht unterstützt": "unsupported",
  "Nicht verfügbar": "Unavailable",
  "Noch auszufüllen": "Still required",
  "Noch erforderlich: geschützte Tunnel-Schlüssel, Einrichtung der Gegenstelle und Prüfung der Erreichbarkeit":
    "Still required: protected tunnel keys, peer configuration and reachability verification",
  "Noch kein passender Fork gefunden. Prüfe die App-Installation":
    "No matching fork found yet. Check the app installation",
  "Noch keine Application Landing Zone Templates definiert.":
    "No Application Landing Zone Templates defined yet.",
  "Noch keine Bestellungen.": "No orders yet.",
  "Noch keine eigene Ausführung": "No personal execution yet",
  "Noch keine kompatiblen Konfigurationen vorhanden.":
    "No compatible configurations yet.",
  "Noch keine OpenTofu-Ausgabe vorhanden.": "No OpenTofu output yet.",
  "Noch keine persönlichen Zugänge geladen.":
    "No personal credentials loaded yet.",
  "Noch keine veröffentlichten Application Landing Zone Templates.":
    "No published Application Landing Zone Templates yet.",
  "Noch keine Vorbereitungen geladen.": "No preparations loaded yet.",
  "Noch nicht abgeschlossen": "Not completed yet",
  "Noch nicht ermittelt": "Not determined yet",
  "noopener noreferrer": "noopener noreferrer",
  "Nur ausgewählte Rollen": "Selected roles only",
  "Nur leere, unbestätigte Arbeitsbereiche ohne weitere Mitglieder können gelöscht werden. Entferne zunächst weitere Mitglieder. Konfigurationen, Zugänge oder Deployment-Daten verhindern das Löschen.":
    "Only empty, unverified workspaces without additional members can be deleted. Remove additional members first. Configurations, credentials or deployment data prevent deletion.",
  "Nur Tokens dieses vertrauenswürdigen OIDC-Ausstellers sollen akzeptiert werden.":
    "Only tokens from this trusted OIDC issuer should be accepted.",
  Observability: "Observability",
  "Observability bereitstellen": "Provision Observability",
  "Observability stellt zentrales Monitoring bereit. Die separate Audit-Protokollierung nutzt einen Telemetry Router, der Audit-Ereignisse an STACKIT Logs und das Object-Storage-Archiv verteilt. Der Archiv-Bucket gehört auch bei deaktivierter Audit-Protokollierung zur Management-Infrastruktur.":
    "Observability provides central monitoring. Separate audit logging uses a Telemetry Router to distribute audit events to STACKIT Logs and the Object Storage archive. The archive bucket belongs to management infrastructure even when audit logging is disabled.",
  "Observability-Starter-EU01": "Observability-Starter-EU01",
  observabilityPlans: "observabilityPlans",
  "oder lade weitere Repositories": "or load more repositories",
  "Offene Einladungen": "Pending invitations",
  "Öffentliche IP zuweisen": "Assign public IP",
  "Öffentliche IP-Adresse der Gegenstelle": "Peer public IP address",
  "Öffentlicher SSH-Schlüssel": "Public SSH key",
  "Öffne eine gespeicherte Konfiguration oder beginne mit einem Template.":
    "Open a saved configuration or start with a template.",
  öffnen: "open",
  Öffnen: "Open",
  "Ohne eigene Einstellung ist diese Sperre im Accelerator eingeschaltet. Aufbewahrungsregeln vor dem Deployment prüfen.":
    "Without a custom setting, this protection is enabled in the accelerator. Review retention rules before deployment.",
  "Ohne Plattformvertrag · Plan gesperrt":
    "No platform contract · Plan blocked",
  "Ohne Vertragsbindung · Plan gesperrt": "No contract binding · Plan blocked",
  "OpenTofu hat die Konfiguration abgewiesen.":
    "OpenTofu rejected the configuration.",
  "OpenTofu initialisiert": "Initializing OpenTofu",
  "OpenTofu konnte die Provider nicht initialisieren.":
    "OpenTofu could not initialize the providers.",
  "OpenTofu konnte keinen vollständigen Plan erstellen. Prüfe die Rechte des Zugangs und die Konfiguration.":
    "OpenTofu could not create a complete plan. Check credential permissions and the configuration.",
  "OpenTofu-Ausgabe": "OpenTofu output",
  "OpenTofu-Ausgabe wird geladen…": "Loading OpenTofu output…",
  "Optional: Eine externe Pipeline darf sich mit ihrem kurzlebigen OIDC-Token am Management-Service-Account der Landing Zone anmelden. Sie erhält dessen Berechtigungen. Für eine kleine Landing Zone und den aktuellen Configurator-Runner ist diese Komponente nicht erforderlich.":
    "Optional: an external pipeline can sign in to the landing zone's management service account using its short-lived OIDC token. It receives that account's permissions. This component is unnecessary for a small landing zone and the current configurator runner.",
  "Optionale Komponenten": "Optional components",
  Ordner: "Folders",
  Organisation: "Organization",
  "Organisation · Bezeichnung aus Konfiguration":
    "Organization · Name from configuration",
  "Organisation / Unternehmen": "Organization / company",
  "Organisations-ID": "Organization ID",
  Organisationsauditoren: "Organization auditors",
  Organisationsverantwortliche: "Organization owners",
  "Originale Accelerator-Quelldaten ansehen":
    "View original accelerator source data",
  "panel common-editor": "panel common-editor",
  "panel fork-workspace": "panel fork-workspace",
  "Passe deine Landing Zone an. Die Strukturansicht aktualisiert sich mit deinen Angaben.":
    "Customize your landing zone. The structure view updates with your details.",
  "Passendes Ziel wählen": "Select matching target",
  "Persönliche STACKIT-Service-Accounts für spätere Deployments verwalten.":
    "Manage personal STACKIT service accounts for later deployments.",
  "Persönlicher Arbeitsbereich": "Personal workspace",
  "Persönlicher Zugang": "Personal credentials",
  "Pflichtangabe bei Bestellung": "Required when ordering",
  "Plan abbrechen": "Cancel plan",
  "Plan abgebrochen": "Plan cancelled",
  "Plan abgelaufen oder keine Gültigkeit bestätigt. Erstelle einen neuen Plan.":
    "The plan expired or has no confirmed validity. Create a new plan.",
  "Plan abgelaufen oder keine Gültigkeit bestätigt. Erstelle und prüfe einen neuen Plan.":
    "The plan expired or has no confirmed validity. Create and review a new plan.",
  "Plan abgeschlossen": "Plan completed",
  "Plan fehlgeschlagen": "Plan failed",
  "Plan fehlgeschlagen.": "Plan failed.",
  "Plan gesperrt": "Plan blocked",
  "Plan läuft": "Plan running",
  "Plan wird berechnet": "Calculating plan",
  "Plan-Ausführung ist in dieser Umgebung noch nicht aktiviert oder nicht verfügbar.":
    "Plan execution is not yet enabled or is unavailable in this environment.",
  "Plan-Input gehört nicht zu dieser Bestellung.":
    "The plan input does not belong to this order.",
  "Plan-Input geprüft · Kein Cloud-Plan ausgeführt":
    "Plan input verified · No cloud plan executed",
  "Plan-Input konnte nicht geprüft werden.": "Could not verify the plan input.",
  "Plan-Input prüfen": "Verify plan input",
  "Pläne konnten nicht geladen werden.": "Could not load plans.",
  Planstatus: "Plan status",
  "Plant eine eigene Secrets-Manager-Instanz für dieses Projekt ein.":
    "Plans a dedicated Secrets Manager instance for this project.",
  "Platform Engineer": "Platform Engineer",
  Plattform: "Platform",
  "Plattform-Grundlage ohne zentralen Netzwerk-Hub mit Vorlagen für eigenständige Projekte und Sandboxes.":
    "Platform foundation without a central network hub, with templates for standalone projects and sandboxes.",
  "Plattform-Kubernetes": "Platform Kubernetes",
  "Plattform-Outputs · JSON-Vertrag": "Platform outputs · JSON contract",
  "Plattformentwurf · zentrale Dienste und Application Landing Zone Templates. Anwendungsprojekte entstehen später durch Bestellungen von Application Ownern.":
    "Platform draft · Shared services and Application Landing Zone Templates. Application projects are created later through orders placed by Application Owners.",
  Plattformrevision: "Platform revision",
  Plattformvertrag: "Platform contract",
  "Plattformvertrag exportieren": "Export platform contract",
  "Plattformvertrag freigeben": "Approve platform contract",
  "Plattformvertrag freigegeben. Es wurden keine Cloud-Ressourcen geändert.":
    "Platform contract approved. No cloud resources were changed.",
  "Plattformvertrag ist zu groß.": "The platform contract is too large.",
  Plattformziel: "Platform target",
  POLICY_BASED: "POLICY_BASED",
  "Policy-based: Pro Verbindung werden die lokalen und entfernten Netze angegeben, deren Verkehr über das VPN laufen soll.":
    "Policy-based: each connection specifies the local and remote networks whose traffic should pass through the VPN.",
  Portweiterleitungen: "Port forwarding",
  POST: "POST",
  "Präfix für Ressourcennamen. Bereits verwendete Kürzel nur bewusst ändern.":
    "Resource name prefix. Change existing prefixes only deliberately.",
  "Präfixlänge des Cluster-Netzes": "Cluster network prefix length",
  "Präfixlänge des Projektnetzes": "Project network prefix length",
  "Private Kubernetes-API über SNA": "Private Kubernetes API via SNA",
  Produktion: "Production",
  "Produktion & Entwicklung": "Production & development",
  "Produktoptionen aktualisieren": "Refresh product options",
  "Produktoptionen für": "Product options for",
  "Produktoptionen konnten nicht geladen werden. Zugang, Projektberechtigungen und Erreichbarkeit prüfen.":
    "Could not load product options. Check credentials, project permissions and reachability.",
  "Profile konnten nicht geladen werden. Bitte aktualisieren.":
    "Could not load profiles. Please refresh.",
  Profilname: "Profile name",
  projectPermissions: "projectPermissions",
  projectRoles: "projectRoles",
  "Projekt ·": "Project ·",
  "Projekt aus der Konfiguration entfernen? Bestehende Ressourcen würden erst durch ein gesondertes Apply geändert.":
    "Remove the project from the configuration? Existing resources would only change through a separate Apply.",
  "Projekt entfernen": "Remove project",
  "Projekt hinzufügen": "Add project",
  "Projekt-Templates": "Project templates",
  Projektart: "Project type",
  "Projektart und Zielordner ändern? Bei bestehenden Ressourcen kann dies einen Umzug oder Ersatz auslösen. Ein Apply wird nicht gestartet.":
    "Change project type and target folder? Existing resources may be moved or replaced. No Apply will be started.",
  Projektberechtigungen: "Project permissions",
  "Projektdienste und Rechte": "Project services and permissions",
  Projekte: "Projects",
  "Projekte (Bestand)": "Projects (existing)",
  "Projekte & Sandboxes": "Projects & sandboxes",
  Projektkürzel: "Project prefix",
  Projektname: "Project name",
  Projektnetz: "Project network",
  Projektrollen: "Project roles",
  "Projektrollen durchsuchen": "Search project roles",
  Projektverantwortlich: "Project owner",
  "Projektverantwortliche Person (verifizierte STACKIT-Identität)":
    "Project owner (verified STACKIT identity)",
  "Projektverantwortliche Person wird bei der Instanziierung zugeordnet":
    "The project owner is assigned during instantiation",
  Protokoll: "Protocol",
  "Protokollaufbewahrung (Tage)": "Log retention (days)",
  Prüfen: "Check",
  "Prüfung abgeschlossen. Bitte beachte das Ergebnis am Profil.":
    "Check completed. Please review the result on the profile.",
  "Prüfung läuft …": "Checking …",
  "Prüfung nicht erfolgreich.": "Check unsuccessful.",
  Public: "Public",
  "Public-Projekte sind unabhängig vom zentralen Netzwerk. Corporate-Projekte gehören zu einem vorhandenen Bereich ihrer Region. Sandboxes sind eigenständige Experimentierprojekte.":
    "Public projects are independent of the central network. Corporate projects belong to an existing area in their region. Sandboxes are standalone experimentation projects.",
  PUT: "PUT",
  "Quellauswahl umkehren": "Invert source selection",
  Quellnetz: "Source network",
  Quellport: "Source port",
  "Referenzprojekt-ID": "Reference project ID",
  "Regeln für Kubernetes-Secrets": "Kubernetes secret rules",
  Region: "Region",
  "Region hinzufügen": "Add region",
  "Region wählen": "Select region",
  "Region:": "Region:",
  "Regionale Netzwerk-Hubs und Projekt-Templates für eu01 und eu02.":
    "Regional network hubs and project templates for eu01 and eu02.",
  Regionen: "Regions",
  "Registrierung fehlgeschlagen.": "Registration failed.",
  Reihenfolge: "Order",
  "Required standalone template is missing":
    "Required standalone template is missing",
  Ressourcen: "Resources",
  "Ressourcen-ID": "Resource ID",
  Ressourcenart: "Resource type",
  Revision: "Revision",
  Richtung: "Direction",
  Rolle: "Role",
  Rollen: "Roles",
  "Rollen bearbeiten": "Edit roles",
  "Rollen bearbeiten:": "Edit roles:",
  "Rollen für die projektverantwortliche Person": "Roles for the project owner",
  "Rollen:": "Roles:",
  Rollenzuweisungen: "Role assignments",
  ROUTE_BASED: "ROUTE_BASED",
  "Route-based: Pro Verbindung werden die statischen Routen zu den entfernten Netzen konfiguriert.":
    "Route-based: each connection configures static routes to remote networks.",
  Routen: "Routes",
  Routing: "Routing",
  "Routing-Tabellen und Routen": "Routing tables and routes",
  "Routing:": "Routing:",
  Routingverfahren: "Routing mode",
  "Runner wird vorbereitet": "Preparing runner",
  S3: "S3",
  "S3 Access Key": "S3 Access Key",
  "S3 Secret Access Key": "S3 Secret Access Key",
  "S3-Backend registriert. Es wurde kein Plan oder Apply ausgeführt.":
    "S3 backend registered. No Plan or Apply was executed.",
  "S3-Lockfile": "S3 lockfile",
  Sandbox: "Sandbox",
  "Sandbox entfernen": "Remove sandbox",
  "Sandbox-Einstellungen bleiben vorerst fest vorgegeben. Ihre Parameter müssen gesondert gegen das Sandbox-Modul qualifiziert werden.":
    "Sandbox settings remain fixed for now. Their parameters must be qualified separately against the sandbox module.",
  "Sandbox-Name": "Sandbox name",
  "Sandbox-Projekte zum Experimentieren.":
    "Sandbox projects for experimentation.",
  "Sandbox-Verantwortlich": "Sandbox owner",
  Sandboxes: "Sandboxes",
  "Sandboxes haben ein eigenes Ressourcenmodell. Für eine andere Art ein neues Projekt anlegen.":
    "Sandboxes have their own resource model. Create a new project for another type.",
  Schlüsselaustausch: "Key exchange",
  "Schlüsselaustausch-Gruppen": "Key exchange groups",
  Schlüsselbund: "Key ring",
  Schlüsselname: "Key name",
  Schlüsselversion: "Key version",
  Schlüsselwechselintervall: "Key rotation interval",
  "Secrets Manager bereitstellen": "Provision Secrets Manager",
  "Secrets Manager integrieren": "Integrate Secrets Manager",
  "Secrets Manager vorsehen": "Include Secrets Manager",
  "Service-Account-Föderation": "Service account federation",
  "Service-Account-Föderation für CI/CD":
    "Service account federation for CI/CD",
  "Service-Account-Schlüssel (JSON)": "Service account key (JSON)",
  "shared-field optional-field": "shared-field optional-field",
  "Sicher gespeichert · Berechtigungen noch nicht geprüft":
    "Securely saved · Permissions not yet verified",
  "Sicher gespeichert · letzte Prüfung siehe unten":
    "Securely saved · Latest check below",
  Sicherheit: "Security",
  "SKE-Betriebssysteme": "SKE operating systems",
  "SKE-Knoten: Betriebssysteme": "SKE nodes: operating systems",
  "SKE-Maschinentypen": "SKE machine types",
  "SKE-Speichertypen": "SKE storage types",
  "SKE-Zonen": "SKE zones",
  SNA: "SNA",
  "SNAs trennen beispielsweise Produktion, Entwicklung oder Mandanten. Corporate-Projekte referenzieren ihre Kennung.":
    "SNAs separate production, development or tenants, for example. Corporate projects reference their identifiers.",
  "Speicher-Leistungsklasse": "Storage service plan",
  "Speichern und zur Bereitstellung": "Save and prepare deployment",
  Speicherort: "Storage location",
  "Speichert eine neue Revision der geöffneten Konfiguration.":
    "Saves a new revision of the open configuration.",
  Speichertyp: "Storage type",
  "Speicherung unvollständig · bitte löschen und neu anlegen":
    "Save incomplete · Please delete and recreate",
  "Speicherziel:": "Save target:",
  "SSH-Schlüsseldatei auf dem Runner": "SSH key file on the runner",
  "Stabile ID innerhalb dieser Konfiguration, z. B. kundenportal-prod. Sie ordnet die Landing Zone ihrem Deployment zu. Nach dem ersten Deployment nur mit geplanter Migration ändern.":
    "Stable ID within this configuration, for example customerportal-prod. It associates the landing zone with its deployment. After the first deployment, change it only with a planned migration.",
  STACKIT: "STACKIT",
  "STACKIT – zum Arbeitsbereich": "STACKIT – go to workspace",
  "STACKIT Accelerator": "STACKIT Accelerator",
  "STACKIT Git": "STACKIT Git",
  "STACKIT hat die Anmeldung abgelehnt. Prüfe, ob der Schlüssel gültig und aktiv ist.":
    "STACKIT rejected sign-in. Check whether the key is valid and active.",
  "STACKIT ist momentan nicht erreichbar oder hat unerwartet geantwortet. Bitte später erneut prüfen.":
    "STACKIT is currently unreachable or returned an unexpected response. Please check again later.",
  "STACKIT Kubernetes Engine": "STACKIT Kubernetes Engine",
  "STACKIT Network Area": "STACKIT Network Area",
  "STACKIT Network Area (SNA, Einzelkonfiguration)":
    "STACKIT Network Area (SNA, single configuration)",
  "STACKIT Network Area (SNA)": "STACKIT Network Area (SNA)",
  "STACKIT Network Areas (SNAs)": "STACKIT Network Areas (SNAs)",
  "STACKIT Observability": "STACKIT Observability",
  "STACKIT Organisations-ID": "STACKIT organization ID",
  "STACKIT Region, in der die Ressourcen angelegt werden sollen.":
    "STACKIT region where resources should be created.",
  "STACKIT VPN": "STACKIT VPN",
  "STACKIT VPN ·": "STACKIT VPN ·",
  "STACKIT VPN hinzufügen": "Add STACKIT VPN",
  "STACKIT VPN-Dokumentation": "STACKIT VPN documentation",
  "STACKIT VPN-Gateway erstellen": "Create STACKIT VPN gateway",
  "STACKIT-Angebote können derzeit im persönlichen Arbeitsbereich geladen werden. Für diesen Organisationsarbeitsbereich muss zunächst die STACKIT-Zuordnung verifiziert werden.":
    "STACKIT offerings can currently be loaded in the personal workspace. This organizational workspace first requires verification of its STACKIT assignment.",
  "STACKIT-Anmeldung": "STACKIT sign-in",
  "STACKIT-Anmeldung derzeit nicht erreichbar.":
    "STACKIT sign-in is currently unavailable.",
  "STACKIT-Anmeldung fehlgeschlagen. Bitte erneut versuchen.":
    "STACKIT sign-in failed. Please try again.",
  "STACKIT-Anmeldung nicht abgeschlossen. Bitte erneut versuchen.":
    "STACKIT sign-in was not completed. Please try again.",
  "STACKIT-Identität": "STACKIT identity",
  "STACKIT-Organisations-ID:": "STACKIT organization ID:",
  "STACKIT-Produktkataloge werden geladen.":
    "Loading STACKIT product catalogues.",
  "STACKIT-Produktoptionen laden": "Load STACKIT product options",
  "STACKIT-Projektberechtigungen": "STACKIT project permissions",
  "STACKIT-Projektrollen": "STACKIT project roles",
  "STACKIT-Provider: Service-Account-Föderation":
    "STACKIT provider: service account federation",
  "STACKIT-Rollenvorlage": "STACKIT role template",
  "STACKIT-Seite: Gateway und konfigurierte Verbindungen":
    "STACKIT side: gateway and configured connections",
  "STACKIT-Standard": "STACKIT default",
  Staging: "Staging",
  Standalone: "Standalone",
  "Standalone-Projekte werden ohne Anbindung an einen zentralen Netzwerk-Hub erstellt. Dafür setzen wir die Netzwerkzuordnung der Vorlage ausdrücklich auf eigenständig.":
    "Standalone projects are created without a connection to a central network hub. The template's network assignment is explicitly set to standalone for this purpose.",
  Standard: "Default",
  "Standard-DNS-Resolver": "Default DNS resolver",
  "Standard-Gültigkeit (Sekunden)": "Default validity (seconds)",
  "Standard-Präfixlänge": "Default prefix length",
  Standardregion: "Default region",
  "State-Backend": "State backend",
  "State-Backends konnten nicht geladen werden.":
    "Could not load state backends.",
  "State-Key": "State key",
  "State-Locking": "State locking",
  "State-Migration": "State migration",
  "State-Prüfung fehlgeschlagen.": "State check failed.",
  "State-Sicherung oder Backend-Migration fehlgeschlagen. Prüfe die Wiederherstellung vor weiteren Aktionen.":
    "State backup or backend migration failed. Check recovery before taking further action.",
  "State-Zuordnung aktualisieren": "Refresh state binding",
  "State-Zuordnung aktualisiert.": "State binding refreshed.",
  "Statische Routen": "Static routes",
  "Statistik aktivieren": "Enable statistics",
  "Status unbekannt": "Unknown status",
  "step active": "step active",
  "steps shared-steps": "steps shared-steps",
  "Struktur deiner Landing Zone": "Your landing zone structure",
  "Struktur deiner Plattform": "Your platform structure",
  "Stündliche Metriken aufbewahren (Tage)": "Hourly metric retention (days)",
  Subdomain: "Subdomain",
  "Suche zurücksetzen": "Reset search",
  "summary-list plan-counts": "summary-list plan-counts",
  "Systemabbild automatisch aktualisieren": "Update system image automatically",
  "Systemabbild-ID": "System image ID",
  "Systemkomponenten zulassen": "Allow system components",
  "Systemlaufwerk (GB)": "System disk (GB)",
  "Technisch verantwortlich": "Technical contact",
  "Technische STACKIT-Zugänge konnten nicht geladen werden.":
    "Could not load technical STACKIT credentials.",
  "Technischer STACKIT-Zugang": "Technical STACKIT credentials",
  "Template ·": "Template ·",
  "Template ansehen": "View template",
  "Template entfernen": "Remove template",
  "Template hinzufügen": "Add template",
  "Template wählen": "Select template",
  "Template-Kennung": "Template identifier",
  "Template-Kennung:": "Template identifier:",
  Templates: "Templates",
  "Templates durchsuchen": "Search templates",
  tenantId: "tenantId",
  "Terraform-Variablen · JSON": "Terraform variables · JSON",
  Test: "Test",
  "Testeingaben zurücksetzen": "Reset test inputs",
  "text-button danger": "text-button danger",
  "tfvars herunterladen": "Download tfvars",
  "tfvars zum Download bereitgestellt.": "tfvars ready to download.",
  "tfvars-Prüfsumme": "tfvars checksum",
  "Token-Aussteller (Issuer-URL)": "Token issuer (issuer URL)",
  "Token-Merkmal (Claim)": "Token attribute (claim)",
  "topology network-topology": "topology network-topology",
  "Trace-Aufbewahrung (Tage)": "Trace retention (days)",
  "Transfernetz (CIDR)": "Transfer network (CIDR)",
  "tree-node folder-node": "tree-node folder-node",
  "tree-node template-node": "tree-node template-node",
  Tunnel: "Tunnel",
  "Tunnel 1": "Tunnel 1",
  "Tunnel 2": "Tunnel 2",
  "Tunnel-Endpunkte": "Tunnel endpoints",
  "Über diese Vorlage": "About this template",
  Übertragungsverfahren: "Transmission mode",
  "Überwachte Ressourcen": "Monitored resources",
  Umgebung: "Environment",
  "Unbenannte Sandbox": "Unnamed sandbox",
  "Unbenannter Ordner": "Unnamed folder",
  "Unbenanntes Template": "Unnamed template",
  "Ungeprüfter Eingabetyp": "Unverified input type",
  "Ungültige GitHub-Weiterleitung.": "Invalid GitHub redirect.",
  "Ungültiger Plattformvertrag.": "Invalid platform contract.",
  Unternehmen: "Company",
  Unternehmenskürzel: "Company prefix",
  userId: "userId",
  "UUID eines vorhandenen STACKIT-Projekts":
    "UUID of an existing STACKIT project",
  Validierung: "Validation",
  Verantwortlich: "Owner",
  "Verantwortlich für die Sandbox": "Sandbox owner",
  "Verbinde eine gespeicherte Konfiguration mit deinem persönlichen Zugang. Wir prüfen Anmeldung und Zielorganisation und halten die genaue gespeicherte Revision fest. GitHub ist optional.":
    "Connect a saved configuration to your personal credentials. We verify sign-in and the target organization and record the exact saved revision. GitHub is optional.",
  "Verbinde einen beschreibbaren Accelerator-Fork. Der Configurator speichert deine Entwürfe im Branch":
    "Connect a writable accelerator fork. The configurator saves your drafts on branch",
  "Verbindung entfernen": "Remove connection",
  "Verbindung und Gegenstelle konfigurieren": "Configure connection and peer",
  "Verbindung:": "Connection:",
  Verbindungen: "Connections",
  "Verbindungen mit jeweils zwei Tunneln pro SNA":
    "Connections with two tunnels each per SNA",
  "Verbindungen protokollieren": "Log connections",
  "Verbindungen und Tunnel": "Connections and tunnels",
  "Verfügbare Komponenten": "Available components",
  "Verfügbare Templates": "Available templates",
  Verfügbarkeitszone: "Availability zone",
  "Verfügbarkeitszone der Ersatz-Appliance":
    "Replacement appliance availability zone",
  Verfügbarkeitszonen: "Availability zones",
  "Verfügbarkeitszonen der beiden Tunnel": "Availability zones of both tunnels",
  "Vergibt die STACKIT-IAM-Rolle auditor auf diesem Ordner. Es werden keine Configurator-Mitgliedschaften angelegt.":
    "Assigns the STACKIT IAM auditor role on this folder. No configurator memberships are created.",
  "Vergibt die STACKIT-IAM-Rolle organization.auditor auf Organisationsebene. Dies ist keine Configurator-Mitgliedschaft.":
    "Assigns the STACKIT IAM organization.auditor role at organization level. This is not a configurator membership.",
  "Vergibt die STACKIT-IAM-Rolle owner auf diesem Ordner. Diese Cloud-Berechtigungen sind unabhängig von Rollen im Configurator.":
    "Assigns the STACKIT IAM owner role on this folder. These cloud permissions are independent of configurator roles.",
  "Vergibt die STACKIT-IAM-Rolle owner auf Organisationsebene an diese Personen. Das sind weitreichende Cloud-Berechtigungen, keine Platform-Engineer-Rollen im Configurator.":
    "Assigns these people the STACKIT IAM owner role at organization level. These are extensive cloud permissions, not Platform Engineer roles in the configurator.",
  Vergleich: "Comparison",
  Vergleichsoperation: "Comparison operator",
  Vergleichswert: "Comparison value",
  "Veröffentlichte Application Landing Zone Templates":
    "Published Application Landing Zone Templates",
  "Veröffentlichung fehlgeschlagen.": "Publishing failed.",
  "Verschlüsselte Laufwerke": "Encrypted disks",
  Verschlüsselungsverfahren: "Encryption algorithm",
  Version: "Version",
  "Version des Firewall-Zugangs": "Firewall credential version",
  "Version nicht im aktuellen Katalog": "Version not in the current catalogue",
  "Version veröffentlichen": "Publish version",
  Versionsnachweise: "Version evidence",
  "Versuche einen anderen Suchbegriff.": "Try another search term.",
  "Vertrauensregel entfernen": "Remove trust rule",
  "Verwaltet Plattform und künftig veröffentlichte Application Templates.":
    "Manages the platform and future published application templates.",
  Verwaltung: "Administration",
  "Verwende die heruntergeladene STACKIT-Schlüsseldatei mit enthaltenem privatem RSA-Schlüssel. Bestehende Projekte und Berechtigungen werden dadurch nicht verändert.":
    "Use the downloaded STACKIT key file containing the private RSA key. This does not change existing projects or permissions.",
  "Verwendet ausschließlich die gespeicherte Version. Änderungen im lokalen Entwurf zuerst speichern und dann erneut auswählen.":
    "Uses only the saved version. Save local draft changes first, then select it again.",
  "Verwendet künftig freigegebene Application Templates. Der Application-Katalog ist noch nicht verfügbar.":
    "Uses approved application templates in the future. The application catalogue is not yet available.",
  "Virtuelle Router-ID": "Virtual router ID",
  volumeTypes: "volumeTypes",
  "Vorauswahl anbieten": "Offer default selection",
  "Vorbereitet · Apply erst nach Planprüfung und Freigabe":
    "Prepared · Apply only after plan review and approval",
  "Vorbereitung entfernen": "Remove preparation",
  "Vorbereitung entfernt.": "Preparation removed.",
  "Vorbereitung gespeichert. Die gespeicherte Konfiguration und Zielorganisation sind festgehalten. Es wurde kein Plan oder Apply ausgeführt.":
    "Preparation saved. The saved configuration and target organization are recorded. No Plan or Apply was executed.",
  "Vorbereitungen aktualisieren": "Refresh preparations",
  "Vorbereitungen konnten nicht geladen werden.":
    "Could not load preparations.",
  "Voreinstellung des Accelerators": "Accelerator default",
  "Vorhandene Netzwerkbereichs-ID": "Existing network area ID",
  "Vorhandener übergeordneter Ordner": "Existing parent folder",
  Vorlage: "Template",
  "Vorlage aus dem Accelerator-Repository.":
    "Template from the accelerator repository.",
  "Vorlagen für spätere Bestellungen durch Application Owner. Diese Einträge sind keine Projekte im Plattform-Deployment.":
    "Templates for future orders by Application Owners. These entries are not projects in the platform deployment.",
  VPN: "VPN",
  "VPN-Konfigurationsschritte": "VPN configuration steps",
  "VPN-Leistungsklasse": "VPN service plan",
  "VPN-Schlüssel, Firewall-Passwörter, API-Secrets und Kubeconfigs gehören nicht in diese Konfiguration. Ihre zusätzlichen geschützten Bindings und die Ausführung des neuen Formats folgen separat.":
    "VPN keys, firewall passwords, API secrets and kubeconfigs do not belong in this configuration. Additional protected bindings and execution of the new format follow separately.",
  "VPN-Verbindung hinzufügen": "Add VPN connection",
  vpnPlans: "vpnPlans",
  "Wähle die passende Grundlage für deine Cloud-Umgebung.":
    "Select the right foundation for your cloud environment.",
  "Wähle eine gespeicherte Vorbereitung. Neue Vorbereitungen legst du im Reiter Vorbereitung an.":
    "Select a saved preparation. Create new preparations in the Preparation tab.",
  "Wähle eine Komponente. Erst ihre Konfiguration verändert den Entwurf.":
    "Select a component. Only configuring it changes the draft.",
  Wartungsfenster: "Maintenance window",
  Weiter: "Continue",
  "Weiter →": "Continue →",
  "Weiter zu Ordnern →": "Continue to folders →",
  "Weiter zu Projekten →": "Continue to projects →",
  "Weitere Connectivity-Region": "Additional connectivity region",
  "Weitere Projektdienste und Rechte":
    "Additional project services and permissions",
  "Weitere Repositories prüfen": "Check more repositories",
  "Weitere Routing-Einstellungen (vorhandene Werte bleiben erhalten)":
    "Additional routing settings (existing values are retained)",
  "Weitere Template-Einstellungen": "Additional template settings",
  "Weiterleitungsziel-IP": "Forwarding target IP",
  "Weiterleitungsziel-Port": "Forwarding target port",
  "Welche Tokens dürfen verwendet werden?": "Which tokens may be used?",
  "Wer betreibt diese Landing Zone und wo soll sie entstehen?":
    "Who operates this landing zone and where should it be created?",
  "werden mit der Plattformkonfiguration im Fork gespeichert. Sie erzeugen beim Plattform-Export keine Anwendungsprojekte. Veröffentlichte Versionen und Bestellungen werden getrennt gespeichert. Die Cloud-Ausführung bleibt bis zur Verifizierung von Identität und Plattformvertrag gesperrt.":
    "are saved with the platform configuration in the fork. They do not create application projects during platform export. Published versions and orders are stored separately. Cloud execution remains blocked until identity and the platform contract are verified.",
  "Wert wählen": "Select value",
  "Wertquelle:": "Value source:",
  "Wiederherstellung erforderlich": "Recovery required",
  "Wird als Präfix für Ressourcennamen verwendet.":
    "Used as a prefix for resource names.",
  "Wird aus der Ressourcenverknüpfung ermittelt":
    "Determined from the resource binding",
  "Wird geladen …": "Loading …",
  "Wird gespeichert": "Saving",
  "Wird im Ressourcennamen verwendet, unabhängig von der stabilen Kennung.":
    "Used in the resource name, independently of the stable identifier.",
  "Wird im Ressourcennamen verwendet. Die stabile Kennung ordnet dagegen die Konfiguration zu.":
    "Used in the resource name. The stable identifier instead identifies the configuration.",
  "Wirksame Template-Vorgaben": "Effective template defaults",
  "Wirksame Werte und Herkunft": "Effective values and sources",
  "X-LZC-CSRF": "X-LZC-CSRF",
  "Zeitlich begrenzter Notfallzugriff": "Time-limited emergency access",
  "Zentrale Konnektivität für gemeinsam vernetzte und eigenständige Projekte.":
    "Central connectivity for shared-network and standalone projects.",
  "Zentrale Netzwerkanbindung": "Central network connection",
  "Zentrale STACKIT Observability": "Central STACKIT Observability",
  "Zentrales Netzwerk mit Firewall für die kontrollierte Kommunikation deiner Workloads.":
    "Central network with firewall for controlled workload communication.",
  "Zertifikatsprüfung deaktivieren": "Disable certificate verification",
  "Ziel:": "Target:",
  "Zielauswahl umkehren": "Invert target selection",
  Zielgruppe: "Audience",
  Zielnetz: "Target network",
  "Zielordner:": "Target folder:",
  "Zielorganisation (UUID)": "Target organization (UUID)",
  Zielport: "Target port",
  Zonen: "Zones",
  Zugang: "Credentials",
  "Zugang aus dem Configurator entfernt. Zum Widerrufen des STACKIT-Schlüssels nutze die Service-Account-Verwaltung im Portal.":
    "Credentials removed from the configurator. Revoke the STACKIT key using service-account management in the portal.",
  "Zugang gelöscht · Vorbereitung kann nicht verwendet werden":
    "Credentials deleted · Preparation cannot be used",
  "Zugang löschen": "Delete credentials",
  "Zugang prüfen": "Check credentials",
  "Zugang prüfen und Vorbereitung speichern":
    "Check credentials and save preparation",
  "Zugang sicher speichern": "Save credentials securely",
  Zugänge: "Credentials",
  "Zugänge aktualisieren": "Refresh credentials",
  "Zugelassene Netze": "Allowed networks",
  "Zugelassene Netzwerkbereiche": "Allowed network areas",
  "Zugelassene SSH-Netze": "Allowed SSH networks",
  "Zugelassener Branch": "Allowed branch",
  Zugriffsregeln: "Access rules",
  "zum erneuten Bearbeiten und": "for further editing and",
  "Zum Inhalt": "Skip to content",
  "Zum Wiederfinden, z. B. Entwicklung · Team Plattform. Das Profil legt noch kein Deployment-Ziel fest.":
    "For identification, for example Development · Platform team. The profile does not yet set a deployment target.",
  "Zuordnung noch nicht verifiziert": "Assignment not yet verified",
  "Zuordnung verifiziert": "Assignment verified",
  Zurück: "Back",
  Zusammenfassung: "Summary",
  Zusatzinformationen: "Additional information",
  "Zusätzliche Berechtigung für Platform Engineers. Eigene Rollen können nur durch ein anderes berechtigtes Mitglied erweitert werden. Mindestens ein Mitglied muss diese Berechtigung behalten.":
    "Additional permission for Platform Engineers. Only another authorized member can extend your roles. At least one member must retain this permission.",
  "Zusätzliche Verantwortliche": "Additional owners",
  "Revision {{value0}}{{value1}}": "Revision {{value0}}{{value1}}",
  "Revision {{value0}}": "Revision {{value0}}",
  "{{value0}} · Version {{value1}} veröffentlicht. Cloud-Ausführung bleibt gesperrt.":
    "{{value0}} · Version {{value1}} published. Cloud execution remains blocked.",
  "{{value0}}, Version {{value1}}, {{value2}}, {{value3}}":
    "{{value0}}, version {{value1}}, {{value2}}, {{value3}}",
  "Lokales Projektnetz{{value0}}": "Local project network{{value0}}",
  "Plattformvertrag gebunden · Ziel {{value0}}":
    "Platform contract bound · Target {{value0}}",
  "Bei Bestellung verifiziert: {{value0}}":
    "Verified when ordering: {{value0}}",
  "STACKIT-Produktkataloge geladen ({{value0}}).":
    "STACKIT product catalogues loaded ({{value0}}).",
  " Nicht verfügbar: {{value0}}.{{value1}}":
    " Unavailable: {{value0}}.{{value1}}",
  "Ordner · {{value0}}": "Folder · {{value0}}",
  "Konfiguration öffnen: {{value0}}": "Open configuration: {{value0}}",
  "Deployment vorbereiten: {{value0}}": "Prepare deployment: {{value0}}",
  "Konfiguration löschen: {{value0}}": "Delete configuration: {{value0}}",
  "Zugang „{{value0}}“ aus dem Configurator löschen? Der Schlüssel wird in STACKIT selbst nicht widerrufen.":
    "Delete credentials '{{value0}}' from the configurator? The key is not revoked in STACKIT itself.",
  "Datenbank · Revision {{value0}}": "Database · Revision {{value0}}",
  "Vorbereitung „{{value0}}“ entfernen? Konfiguration und Cloud-Ressourcen bleiben bestehen.":
    "Remove preparation '{{value0}}'? The configuration and cloud resources remain.",
  "Vertrauensregel {{value0}}": "Trust rule {{value0}}",
  "Erstbereitstellungsplan noch nicht verfügbar: {{value0}}":
    "Initial deployment plan not yet available: {{value0}}",
  "Connectivity {{value0}}": "Connectivity {{value0}}",
  "Verfügbare Connectivity-Komponenten {{value0}}":
    "Available connectivity components {{value0}}",
  "Connectivity {{value0}} aus der Konfiguration entfernen? Zugehörige SNAs und Dienste würden bei einem späteren Apply entfernt. Referenzierte SNAs müssen zuerst umgeordnet werden.":
    "Remove connectivity {{value0}} from the configuration? Associated SNAs and services would be removed during a later Apply. Referenced SNAs must first be reassigned.",
  "STACKIT Organisation: {{value0}} · Zuordnung noch nicht verifiziert":
    "STACKIT organization: {{value0}} · Assignment not yet verified",
  "Arbeitsbereich öffnen: {{value0}}": "Open workspace: {{value0}}",
  "Zu {{value0}} wechseln": "Switch to {{value0}}",
  "Arbeitsbereich „{{value0}}“ löschen? Das ist nur für leere, unbestätigte Entwürfe ohne weitere Mitglieder möglich. STACKIT-Ressourcen werden nicht verändert.":
    "Delete workspace '{{value0}}'? This is possible only for empty, unverified drafts without additional members. STACKIT resources are not changed.",
  "STACKIT Organisation: {{value0}} · {{value1}}":
    "STACKIT organization: {{value0}} · {{value1}}",
  "Apply: {{value0}}": "Apply: {{value0}}",
  "{{value0}} deaktivieren? Zugehörige Konfigurationen werden entfernt. Abhängige Dienste anschließend prüfen.":
    "Disable {{value0}}? Associated configurations will be removed. Check dependent services afterwards.",
  "Standard: {{value0}}": "Default: {{value0}}",
  "Eintrag „{{value0}}“ entfernen? Abhängige Projekte und Dienste anschließend prüfen.":
    "Remove entry '{{value0}}'? Check dependent projects and services afterwards.",
  "Eingaben und Verknüpfungen: {{value0}}": "Inputs and bindings: {{value0}}",
  "Fester Wert: {{value0}}": "Fixed value: {{value0}}",
  "Erlaubte Werte: {{value0}}": "Allowed values: {{value0}}",
  "Vorauswahl: {{value0}}": "Default selection: {{value0}}",
  "Bestellung: {{value0}}": "Order: {{value0}}",
  "Konnektivität · {{value0}} · {{value1}}":
    "Connectivity · {{value0}} · {{value1}}",
  "Landing Zone · {{value0}} · {{value1}}":
    "Landing Zone · {{value0}} · {{value1}}",
  "Bestehender übergeordneter Ordner · {{value0}}":
    "Existing parent folder · {{value0}}",
  "Verfügbarkeitszone für {{value0}}": "Availability zone for {{value0}}",
  "{{value0}}: Gegenstellenadresse für {{value1}}":
    "{{value0}}: peer address for {{value1}}",
  "VPN-Verbindung {{value0}} aus der Konfiguration entfernen?":
    "Remove VPN connection {{value0}} from the configuration?",
};
