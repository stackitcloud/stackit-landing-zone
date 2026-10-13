# MVP-Abnahme

Stand: 2026-10-09, Ubuntu. Diese Liste trennt lokale technische Nachweise von
fachlicher und echter Cloud-Abnahme. Ein bestandener Mock-Test ersetzt keine
Cloud-Abnahme. Der Gesamt-MVP und ein Merge sind noch nicht freigegeben.

## Assistant: einzelne Felder, bekannte Kontakte und Grundlagen wiederherstellen

Stand 2026-10-12. Ersetzt die historische Gesamtannahme-/Kontaktgrenze unten.
Vorschlaege erscheinen feldweise mit Klartextwerten statt verschachteltem JSON.
Ausgewaehlte Felder koennen unmittelbar gespeichert werden; verbleibende Felder
bleiben als Vorschlag auf der neuen Konfigurationsrevision erhalten. Keine neue
Modellanfrage. Alte Gesamtannahme bleibt kompatibel. Compiler/RLS/Revisionen
pruefen Teilannahmen atomar; ungueltige Pflichtfeldkombinationen liefern HTTP422.

DNS-Kontakt kann bekannte owner_email aus Grundlagen oder die aktuell verifizierte
menschliche Login-E-Mail als pruefbares Default nutzen. Vorhandenen DNS-Kontakt
erhalten, explizite neue Kontaktangaben beachten; keine erfundene Adresse oder
stille Speicherung. organization_id ist jetzt ein begrenzter Entwurfswert:
nur eine ausdruecklich benannte gueltige UUID, keine Organisationsbindung,
Zugriffspruefung oder Ausfuehrungsfreigabe. Weitere Cloud-IDs bleiben gesperrt.

Der echte Grundlagenfehler war `invalid_scope`: alte Scalar-Grenze ohne
owner_email/organization_id. Reale synthetische Proben zeigten zusaetzlich
ueberholte DNS-Fragen und falsche Gespeichert-Behauptungen. Deshalb stammen die
Abschlusstexte dieser Entwurfsschritte aus den validierten Feldern; der vorlaeufige
Stream zeigt nur Pruefstatus. Grundlagenfragen/-quellen bleiben im aktuellen
Grundlagenschritt, beantwortete Werte werden nicht nochmals abgefragt.

Nachweise: 41 Assistant-Unit-/HTTP-Faelle, 41 echte isolierte PostgreSQL-Faelle
(inklusive teilweiser DNS-/SNA-Annahme, Revisionen, verifizierter und widerrufener
Login-E-Mail) sowie vier Desktop-/Mobilfaelle mit feldweisem Diff und zwei
aufeinanderfolgenden Annahmen bestanden. Typpruefung, Build, gezieltes Lint und
Wissensfrische bestanden; bestehende Lint-/Bundlewarnungen unveraendert.
Zwei finale echte synthetische Modellrunden bestanden: bekannter DNS-Kontakt
ohne erneute Rueckfrage (5082 ms), Grundlagenwechsel mit exakt vorgegebener UUID
und allen fuenf bekannten Scalarwerten ohne DNS-Fragen (4619 ms).
Keine Kundennachricht zur Probe gesendet, keine Kundenkonfiguration gespeichert,
kein Cloud-Plan/Apply/Destroy/Commit/Release. A01-A24 und #94 bleiben offen.

## Assistant: sinnvolle Vorschlaege fuer die uebrigen DNS-Einstellungen

Korrektur vom 2026-10-12 nach Benutzer-Rueckmeldung: DNS-Vervollstaendigung wird
jetzt semantisch im Intent-Schritt erkannt, auch bei "DNS Thema vervollstaendigen,
da fehlen noch einige weitere Details" und Folgeauftraegen ohne DNS-Schluesselwort.
Die bisherige Wortmusterpruefung erfasste diese Anfrage nicht. Der widerspruechliche
interne Names-only-Vertrag ist durch den nativen Mehrfeldvertrag ersetzt.
Gespeicherte Konfigurationswerte haben Vorrang vor veralteten Assistentenantworten.
Bei einer eindeutigen bestehenden Zone verlangt das Antwortschema einen Vorschlag
mit Anzeigename, Beschreibung und TTL; Backend-Guards pruefen dies ebenfalls
und schuetzen den vorhandenen Domainnamen. Als Rueckfrage bleibt nur ein fehlender
optionaler Kontakt, keine erneute Domain-/Uebernahmebestaetigung.

Nachweise der Korrektur: 35 fokussierte Assistant-Faelle, einschliesslich
veralteter Names-only-Historie, deutscher/englischer Folgeauftraege, unvollstaendiger
Antworten und unerlaubter Domainaenderung. Zwei echte synthetische GPT-OSS-/Qwen-
Runden lieferten Anzeigename, Beschreibung und TTL3600 ohne Domainaenderung oder
erneute Uebernahmefrage (8702/7580 ms). Keine Kundennachricht zur Probe gesendet,
keine Konfiguration gespeichert oder Cloud-Aktion ausgefuehrt.
Typpruefung, gezieltes Lint und Wissensfrische bestanden. Lokal im Chat-Modus
aktiviert; API HTTP200, anonyme Chat-Route HTTP401. Konfigurations- und
Gespraechspruefsummen sowie Revisionen vor/nach Neustart identisch.

Stand 2026-10-12. Ersetzt die darunter dokumentierte Namens-only-Grenze:
Bestehende zentrale DNS-Zonen unterstuetzen partielle native Feldpatches fuer
`dns_name`, `name`, `description`, `default_ttl`, `type=primary`,
`contact_email`, `acl` und `network_area_key`. Schluessel/unangefragte Felder
bleiben erhalten. Keine neuen Zonen, regionale Konvertierung, Resolver, Records,
Provider-only-Optionen oder Cloud-Ausfuehrung. Secondary braucht Primaries,
die der native Accelerator nicht verdrahtet; kein stiller Typwechsel.

Der Kontext enthaelt validierte vorhandene DNS-Werte und native Standardwerte,
keine unbekannten Importfelder oder geheimnishaltigen Beschreibungen. Ein Auftrag
zu restlichen DNS-Feldern verlangt im Modellschema konkrete Anzeigenamen,
Beschreibungen und TTL-Vorschlaege. Vorhandene TTL erhalten, sonst native
Baseline 3600 Sekunden, 300 Sekunden nur bei explizit haeufigen Aenderungen.
Gepinnter Provider0.114.0: TTL60..99999999, Name max63, Beschreibung max1024.
Die Erklaerung bleibt erhalten, mit Hinweis auf ungespeicherten Vorschlag und
separate Gesamtannahme. Keine erneute Domain-Auswahl erforderlich.

Kontakt nie aus Firmenname/Domain erfinden: Modellschema erlaubt nur vorhandene
oder userbelegte Adressen, Backend prueft erneut. Kontaktfrage ist optional und
ohne erfundene Beispiele. ACL nur bestehende/explizite CIDRs; laut gepinntem
Provider derzeit KEINE Zugriffsbeschraenkung, keine Sicherheitszusage.
Netzbereich nur bestehend/ausdruecklich angegeben; default ist native implizite
Zuordnung, kein erfundener Wechsel. Anbieterfakten/quellen in DNS-Wissen v4;
Wissensbudget unveraendert.

Nachweise: 32 Assistant-Faelle, 38 echte isolierte PostgreSQL-Faelle und zwei
Desktop-/Mobilfaelle fuer Mehrfeld-Diff/Gesamtannahme. Vor Annahme keine
Aenderung, danach neue Revision, Anzeigename/Beschreibung/TTL im nativen tfvars,
Kontakt/Identitaeten/unangefragte Felder erhalten; Schutz vor erfundenen
Kontakten/ACLs, ungueltigen Grenzen und fachfremden Feldern.
Erste echte synthetische Probe liess Beschreibung/TTL aus; strukturelles
Mehrfeldschema korrigiert dies. Weitere Probe erfand Kontaktplatzhalter;
Backend lehnte ihn ab, Kontakt-Whitelist verhindert diesen Patch nun bereits
im Antwortschema. Reale Folgeprobe: 9730 ms, Name/Beschreibung/TTL/Primary-
Vorschlag, Kontakt/ACL ungesetzt, Domain erhalten, nativer Export, Ausgang
unveraendert. Kontaktbeispiel und unbelegte Dienstannahme in dieser Probe
anschliessend durch gepruefte optionale Kontaktfrage und schaerfere Beschreibung
korrigiert. Finales Gate/Modell/Aktivierung wird nach Abschluss ergaenzt.

Benutzerabnahme: selben Folgeauftrag im vorhandenen Chat erneut senden, neue
Feldwerte/Begruendungen pruefen und erst dann den Gesamtvorschlag uebernehmen.
Kontakt bei Bedarf tatsaechlich benennen. Verfuegbarkeit, DNS-Dienstkosten und
echte Bereitstellung/Propagation bleiben offen. Kein Kundenchat/Tabreload zur
Pruefung, keine Migration/Tokenrotation/Cloud-Plan/Apply/Destroy/Commit/Release.
A01-A24 weiterhin `not-qualified`; #94 bleibt offen und Labels unveraendert.

## Assistant: bestaetigten DNS-Namen als Konfigurationsvorschlag uebernehmen

Stand 2026-10-11. Erweitert die darunter dokumentierte reine DNS-Namensberatung:
Bestehende zentrale `connectivity.dns_zones` lassen sich jetzt mit einer
partiellen Map bestehender Schluessel zu `{dns_name:string}` vorschlagen.
Eine Namensbestaetigung im Chat bereitet den Diff vor; erst "Gesamten Vorschlag
uebernehmen" speichert die Konfiguration mit neuer Revision. Keine Cloud-Aktion.
Der interne Zonenschluessel, etwa `example-corp`, bleibt stabil. Domainwert,
nicht Schluessel, wird geaendert. Netzbereich, TTL, Kontakt, Beschreibungen,
Identitaeten und alle nicht angefragten Einstellungen bleiben erhalten.

Keine neuen Zonen, Metadaten-/Resolver-Patches oder regionale Formwechsel.
Eine vorhandene Zone ist eindeutig; mehrere Zonen brauchen eine klare Auswahl.
Backend lehnt fremde Felder/neue Schluessel ab und entfernt unveraenderte Namen.
Modell sieht nur Zonenschluessel/Namen, keine Kontakt-/Zugangsmetadaten.
DNS-Quellen sind im Antwortschema begrenzt; gepruefter Abschluss nennt immer
ungespeicherten Vorschlag, explizite Uebernahme und ungepruefte Verfuegbarkeit.
DNS-Wissen v3 und aktiver Systemvertrag ersetzen die alte Nurtext-Einschraenkung;
Wissensbudget unveraendert durch gekuerzten Text, keine stille Trunkierung.

Nachweise: 29 Assistant-Tests, 38 isolierte PostgreSQL-Faelle und vier
Desktop-/Mobil-Browserfaelle einschliesslich bestehender Gesamtannahme und
DNS-Diff. Vor Annahme unveraenderter Entwurf, danach neue Revision und
Domain im nativen tfvars-Export; Nutzerisolation und Metadatenerhalt geprueft.
Mobil-Diff gestapelt und vollstaendig sichtbar, Container-Geometrie und
Screenshots geprueft. Echte synthetische GPT-OSS/Qwen-Probe nach "Ja, passt."
lieferte den korrekten Namenspatch in 3565 ms ohne neue Rueckfragen; der dabei
gefundene SNA-Verweis/voreilige Aenderungssatz wird durch den finalen
DNS-Quellen-/Abschlussvertrag korrigiert. Finale reale Probe nach alter Nurtext-
Ablehnung: 3494 ms, korrekter DNS-Namenspatch, keine Rueckfrage, Referenz
dns-zones, eindeutiger ungespeicherter Vorschlag und nativer tfvars-Export.
App-Gate Wissensfrische/Lint/Typen/Build und 470 Unit-Tests bestanden,
53 umgebungsgebundene Tests uebersprungen. Lokal aktiviert, GPT-OSS-Intent/
Qwen-Antwortmodell unveraendert, Execution/Application-Execution/Recovery aus.
API/Preview HTTP 200, anonymer Stream HTTP 401; aktuelle Konfiguration und
Gespraech vor/nach Neustart mit exakt gleichen Inhaltspruefsummen. Keine
Migration oder Schluesselaenderung. Kein Kundenchat oder offener Tab zur Pruefung.

Benutzerabnahme: Ungespeicherte Eingaben sichern, fuer den mobilen Diff den Tab
selbst neu laden, vorhandenen Chat weiterverwenden und den bestaetigten DNS-Namen
als Konfigurationsvorschlag erneut anfragen. Diff pruefen und ganz uebernehmen.
Verfuegbarkeit, DNS-Dienstkosten und echte Bereitstellung/Propagation bleiben
offen. Keine Migration, Cloud-Plan/Apply/Destroy, Tokenrotation, Commit oder
Release; A01-A24 `not-qualified`, #94 bleibt offen und Labels unveraendert.

## Assistant: belegte freie STACKIT-DNS-Endungen

Stand 2026-10-11. Die vom Benutzer verlinkte STACKIT-Anleitung Manage DNS zones
wurde geprueft. Fuenf bereitgestellte Endungen: `runs.onstackit.cloud`,
`stackit.rocks`, `stackit.gg`, `stackit.zone`, `stackit.run`. `stackit.cloud`
ist keine dieser Endungen. Eine freie Primary-Zone hat genau ein zusaetzliches
Label; tiefere Namen sind Records darunter. Freie Subdomain vermeidet einen
Domainkauf/eigene Delegation, nicht die Gebuehren des DNS-Dienstes.

DNS-Wissen v2 enthaelt diese Fakten, konkrete firmenbezogene Namensvorschlaege,
ungepruefte Verfuegbarkeit sowie native Netzbereich-/Projektzuordnung. Quellen
enthalten die Anleitung und beide nativen Zonenressourcen. Keine neuen
DNS-Patchrechte: Beratung bleibt textuell, keine Speicherung/Einrichtung.

Reale synthetische Gegenchecks zeigten zunaechst falsche SNA-Themenauswahl,
danach ignorierte DNS-Fakten unter PIM-/zu breiten Namensanweisungen. DNS-/SNA-
Klassifikationsbeispiel, aktiver gepruefter DNS-Systemkontext statt PIM und auf
Firmen-/Ordner-Patches begrenzte Namensdelegation korrigieren diesen lokalen
Fall. Finale Example-GmbH-Probe: `example-gmbh.runs.onstackit.cloud`, explizit
ungepruefte Verfuegbarkeit, keine Namens-/Endungsrueckfragen, keine Aenderungen
oder Einrichtungsbehauptung, Referenz dns-zones, 8562 ms. Kein Kundenkontext.

27 Assistant-Tests und Typcheck bestehen, inklusive DNS-Systemkontext mit allen
fuenf Endungen, fehlender PIM-Ueberlagerung, Quellenfassung und changes.maxItems=0.
Wissensbudget unveraendert. Kein neuer PostgreSQL-/Browser-/Cloud-Lauf fuer
diese Modell-/Wissenskorrektur. Finales App-Gate: Wissensfrische, Lint, Typen,
Build und 468 Unit-Tests bestanden, 53 umgebungsgebundene Tests uebersprungen.
Lokal aktiviert mit unveraendertem GPT-OSS-Intent-/Qwen-Antwortmodell und
deaktivierter Execution/Application-Execution/Recovery. API/Preview HTTP 200,
anonymer Stream HTTP 401. Bestehende Konfiguration und Gespraech vor/nach
Neustart mit exakt gleichen Inhaltspruefsummen. Keine Migration,
Token-/Schluesselrotation, Kundenchat-Anfrage oder Reload des offenen Editors.

Benutzerabnahme: dieselbe DNS-Bitte im vorhandenen Chat erneut senden; Domain
fachlich pruefen. Verfuegbarkeit, echte Zone/Records, Kosten und Propagation
sind nicht abgenommen. Eine Domainempfehlung ist keine DNS-Bereitstellung.
#94 bleibt offen, A01-A24 bleiben `not-qualified`; keine Cloud-Aktion,
Veroeffentlichung, Commit, Push oder Release.

## Assistant: Auswahlfragen und eingegrenzte Vorschlaege

Stand 2026-10-11. Rueckfragen im Konfigurations-Chat und in der Template-Beratung
haben eine eigene Ansicht mit kurzen Optionen, Einzel-/Mehrfachauswahl und
Freitext. Alte Fragen ohne Optionen bleiben lesbar. Maximal sechs eindeutige
Optionen mit 160 Zeichen; Fragen-/Zugangsschutz gilt auch fuer Optionstexte.
Neue Modellantworten verwenden strukturierte Fragen, waehrend gespeicherte
Altfragen weiterhin gueltig bleiben. Keine Migration und keine neue Patch-Art.

Auswahl bereitet eine Nachricht mit zugehoerigen Fragen vor. Der Benutzer kann
sie bearbeiten und sendet ausdruecklich; vorhandener Nachrichtentext bleibt
erhalten. Ueber 4000 Zeichen wird nichts eingefuegt oder abgeschnitten. Keine
automatische Anfrage, Konfigurationsaenderung oder Ausfuehrung durch Auswahl.
Optionen stammen nur aus dem validierten Abschluss, nicht aus Streaming-Teiltext.

Checkboxen im Diff erlauben Eingrenzung: Ausgewaehlte Felder/Werte werden als
neue Anfrage vorbereitet. Solange nur ein Teil ausgewaehlt ist, bleibt die
gesamte Annahme gesperrt. Erst ein neuer validierter Vorschlag kann wieder als
Ganzes angenommen werden. Keine direkte Teilannahme oder Umgehung nativer
Abhaengigkeiten. Strukturierte Maps bleiben eine Aenderungseinheit. Der Benutzer
muss den gesamten neuen Diff pruefen; die Auswahl ersetzt keine Fachpruefung.

Nachweise: 26 Assistant-Tests, 37 echte isolierte PostgreSQL-Faelle und vier
Desktop-/Mobil-Browserfaelle bestanden. Optionsgrenzen, geschuetzte Optionstexte,
Altfragen, lesbare Historie/Persistenz, Mehrfachauswahl/Abwahl/Freitext,
Nachrichtenlaenge, keine automatische Anfrage, gesperrte Teilannahme, erneuter
Vorschlag und anschliessende Gesamtannahme geprueft. Radio-/Checkboxgroessen,
Textumbruch und Desktop-/Mobil-Screenshots geprueft. Echte synthetische Qwen-Probe
lieferte Template-Auswahloptionen in 5325 ms und Firewall-Optionen in 4337 ms
ohne Aenderungen. Ein erster optionaler Transportschema-Versuch lieferte nur
Auswahlankuendigung ohne Optionen; eindeutiges strukturiertes Schema behebt
diesen lokalen Fall. Optionen/Mehrfachmodus bleiben Modellinterpretation,
kein Vollnachweis fachlicher Vollstaendigkeit oder Produkt-/Policy-Eignung.

Benutzerabnahme: Ungespeicherte Eingaben zuerst sichern, vorhandenen Tab selbst
neu laden, bestehenden Chat weiterverwenden und bei neuen Rueckfragen Auswahl
und Freitext pruefen. Die neue Darstellung erfindet fuer alte Freitextfragen
keine Auswahloptionen. Kein Kundenchat oder offener Editor zur Verifikation
geaendert. Finales App-Gate: Wissensfrische, Lint, Typen, Build und 467 Unit-Tests
bestanden; 53 umgebungsgebundene Tests uebersprungen. Lokal in der bestehenden
API/Preview aktiviert, GPT-OSS-Intent/Qwen-Antwortmodell unveraendert und
Execution/Application-Execution/Recovery deaktiviert. API/Preview HTTP 200,
anonymer Stream HTTP 401. Bestehende Konfiguration und Gespraech unmittelbar
vor/nach Neustart mit exakt gleichen Inhaltspruefsummen. Keine neue Migration,
Schluessel-/Tokenaenderung oder Kundenchat-Nachricht.
#94 bleibt offen, A01-A24 bleiben `not-qualified`; keine Cloud-Aktion,
Veroeffentlichung, Commit, Push oder Release.

## Assistant: explizit delegierte Grundlagen- und Ordnernamen

Stand 2026-10-11. Der Grundlagenauftrag scheiterte am zu engen Patch-Vertrag:
Ordnernamen waren nicht vorgesehen, und gewaehlte Firmenkuerzel benoetigten
woertliche Benutzerbelege. Explizite Namensdelegation erlaubt nun begrenzt
`company_name`, `company_code` und Namen vorhandener `rm_folders`.

- Der Klassifikator waehlt eine enumerierte Referenz auf die unveraenderte
  aktuelle/fruehere Benutzer-Nachricht oder den Benutzer-Template-Kontext.
  Assistant-Aussagen und fremde Referenzen sind ausgeschlossen. Delegierte
  Felder mit Quelle `none` sind ungueltig. Modellzitate wurden typografisch
  veraendert; unscharfe Zitatnormalisierung oder Zustimmung-Fallbacks gibt es
  nicht. Semantische Delegationserkennung bleibt eine begrenzte Modellaufgabe.
- Ordnerpatches enthalten ausschliesslich bestehende Schluessel und Namen
  mit 1-40 Zeichen. Native Defaults werden im Lesekontext als Namen sichtbar;
  explizite leere Maps bleiben leer. Eigentuemer, Leser, Beschreibungen,
  interne Identitaeten und andere Governance-Werte bleiben unveraendert.
  Keine neuen Ordner, erfundenen Cloud-IDs, Regionen oder IAM-/Zugangswerte.
- Echter synthetischer Auftrag nach SNA-Historie: Firmenname, Kuerzel und vier
  Ordnernamen, nativer tfvars-Export und unveraenderte Identitaeten; 5331 ms.
  GPT-OSS bleibt Intent-Modell, Qwen bleibt Antwortmodell. Keine Ausfuehrung.
- 25 fokussierte Assistant-Tests, 37 echte isolierte PostgreSQL-Faelle und
  Typcheck bestanden. Der neue DB-Fall prueft Namen-only-Modellkontext ohne
  Owner-/Reader-E-Mails, unveraenderte Konfiguration vor Annahme und native
  Uebernahme mit vollstaendig erhaltenen Metadaten/Identitaeten danach.
  Keine neue Migration, keine Kundenanfrage zur Verifikation, kein neuer
  Browser-/Cloud-Gesamtlauf. Finales App-Gate: Wissensfrische, Lint, Typen,
  Build und 466 Unit-Tests bestanden, 53 umgebungsgebundene Tests uebersprungen.
- Lokal aktiviert mit unveraendertem GPT-OSS-Intent-/Qwen-Antwortmodell und
  deaktivierter Plattform-/Application-Ausfuehrung sowie Recovery. API und
  Preview HTTP 200, anonymer Stream HTTP 401. Bestehende Konfiguration und
  Gespraech vor/nach API-Neustart mit exakt gleichen Inhaltspruefsummen.
  Keine Kundenchat-Nachricht gesendet und kein offener Editor-Tab neu geladen.

Benutzerabnahme: dieselbe Anfrage im bestehenden Chat erneut versuchen,
Kuerzel und Ordner-Diff pruefen und nur bei Zustimmung den gesamten Vorschlag
uebernehmen. Kein neues Gespraech wegen aktualisiertem Wissen notwendig.
Offen: Qwen beschreibt den Entwurf in der realen Probe noch als eingerichtet
und das Kuerzel als ID. Dies ist keine erfolgte Bereitstellung oder Cloud-ID;
Antwortqualitaet und vollstaendige Grundlagenberatung bleiben Pilot-Grenzen.
#94 bleibt offen, A01-A24 bleiben `not-qualified`; keine Cloud-Aktion,
Veroeffentlichung, Commit, Push oder Release.

## Assistant: Auto-Scroll und Streaming lokal aktiviert

Stand 2026-10-11. Benutzer hat nach Hinweis auf die offenen Planer-Grenzen
ausdruecklich die lokale Testaktivierung samt Planer-Pilot freigegeben.
Dieser Abschnitt ersetzt die frueheren Nicht-Aktivierungsnotizen fuer den
aktuellen lokalen Laufzeitstand, nicht die fehlende produktive/fachliche Abnahme.

- Konfigurations-Chat und Template-Beratung scrollen ihre Nachrichtenflaeche
  beim Laden, Oeffnen, nach Antworten und bei Teiltext zum Ende. Kein globales
  Scrollen der Editor-Seite. Die Anfrage erscheint waehrend des Wartens im Chat.
- Echte Model-Serving-SSE-Teilantworten fuer `explanation` werden ueber einen
  optionalen NDJSON-POST-Stream weitergegeben. UI kennzeichnet sie als
  vorlaeufig; nur der vollstaendig validierte und gespeicherte Abschluss liefert
  Empfehlung/Diff. Keine partielle Akzeptanz, Speicherung oder Ausfuehrung.
  Bisherige JSON-Clients bleiben kompatibel. Keine neuen Patch-Rechte durch
  Streaming, keine Modell-Token-Rotation und keine neue Migration.
- SSE-/JSON-Parser, Modellname, Abschluss, Antwort-/Puffergroessen, Zeitlimit
  und Abbruch werden geprueft. Textaktualisierungen sind begrenzt. Auth/CSRF
  bleiben vor dem Stream; Service prueft Rechte, Revision und Ablauf vor dem
  Speichern erneut. Fehler verwerfen Teiltext und erhalten die Eingabe.
  Echter PostgreSQL-Abbruchtest: vorlaeufiger Text, anschliessender Abbruch,
  keinerlei Aenderung an Nachrichten, Vorschlag, Revision oder Konfiguration.
- Lokale API mit `LZC_MODEL_SERVING_INTENT_MODEL=openai/gpt-oss-120b` gestartet;
  Qwen bleibt das Antwortmodell. Execution/Recovery bleiben deaktiviert.
  Gesundheitspruefung und Preview HTTP 200; anonymer Stream HTTP 401.
  Eine Konfiguration und ein Gespraech mit exakt unveraenderten Pruefsummen
  vor/nach dem Neustart. Keine Kundenanfrage fuer die Verifikation gesendet.

Nachweise: Wissensfrische, Lint, Typen, Build und 465 Unit-Tests bestanden,
53 umgebungsgebundene Tests uebersprungen. 24 fokussierte Assistant-Tests,
36 echte isolierte PostgreSQL-Faelle, vier Desktop-/Mobil-Chatfaelle bestanden.
Browser prueft Teiltext vor Abschluss, verborgenen neuen Diff, lange Historie,
Auto-Scroll, explizite gesamte Akzeptanz, Wiederaufnahme und Fehler/Retries.
Desktop-/Mobil-Screenshots angesehen. Kein voller E2E-/Cloud-Qualifikationslauf.

Reale synthetische Qwen-Streaming-Proben: Template-Beratung erster Text
6914 ms, Abschluss 9939 ms, 28 Textstaende; Konfigurations-Chat erster Text
1529 ms, Abschluss 4312 ms, 20 Textstaende. Einzelproben, kein Lastnachweis.
Intent-Abfrage und Katalogabruf bleiben vor den ersten Antworttokens; Streaming
garantiert keine sofortige Ausgabe und keine bessere Modellqualitaet.

Benutzerabnahme: ungespeicherte Eingaben zuerst sichern, vorhandenen Tab neu
laden, bestehenden Chat weiterverwenden und Teilantwort/Scrollverhalten pruefen.
Der Agent hat den offenen Editor-Tab nicht neu geladen. Modellantworten koennen
Entwuerfe weiterhin sprachlich als bereits umgesetzt beschreiben und offene
Geschaeftsfragen auslassen; lokale Testfreigabe behebt diese Qualitaetsgrenzen
nicht. #94 bleibt offen; A01-A24 bleiben `not-qualified`. Keine Cloud-Aktion,
Veroeffentlichung, Commit, Push oder Release.

## Assistant: separates Intent-Modell erfolgreich gegengeprueft

Nach ausdruecklicher Benutzerfreigabe am 2026-10-10 wurde
`openai/gpt-oss-120b` vom bestehenden Model-Serving-Endpunkt ausschliesslich
fuer `conversation_intent` getestet. Das Antwortmodell bleibt
`Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`. Der Client unterstuetzt dafuer optional
`intentModel`; ohne diesen Wert bleibt die bisherige Modellwahl erhalten.
Antworten werden gegen das jeweils angeforderte Modell geprueft. Keine neue
Environment-/Runtime-Verdrahtung und keine Aktivierung dieser Fassung.

Drei reale synthetische Gegenchecks bestehen fuer die Intent-Grenze:

- Expliziter vollstaendig spezifizierter SNA-Vorschlag nach Firewall-Historie:
  Thema SNA, Modus `draft`, ein nativer `connectivity.network_areas`-Patch,
  erfolgreiche lokale Kompilation und tfvars-Export; keine Ausfuehrung.
- Explizite SNA-Beratung nach derselben Historie: Thema SNA, Modus `advice`,
  keine Aenderung. Namenlose Firewall-Kapazitaetsantwort: Firewall-Thema,
  Modus `advice`, Verkehrs-/Kapazitaetsbelege aus Benutzerhistorie erhalten,
  keine Aenderung. Tatsächlich angeforderte und zurueckgegebene Modellnamen
  wurden fuer beide Aufrufe separat geprueft.
- Intent-Aufrufe ca. 1,1-2,8 Sekunden; komplette Antworten ca. 3,0-4,6 Sekunden
  in diesen drei Einzelproben, kein Last-/Verfuegbarkeitsnachweis.

Der zuvor dokumentierte Qwen-only-Intent-Blocker ist durch diesen Gegencheck
lokal umgangen, nicht als Qwen-only geloest. Die Antwortqualitaet bleibt offen:
Qwen beschreibt einen blossen SNA-Entwurf irrefuehrend als bereits konfiguriert,
ordnet eine Adresspool-Frage dem Prefix-Feld zu und laesst nach beantworteter
Firewall-Kapazitaet die noch offene Betriebsentscheidung aus. Deshalb keine
vollstaendige Dialogabnahme oder Aktivierung allein aus korrekter Intent-Wahl.
Naechster technischer Nachweis: korrekte Entwurfs-/Ausfuehrungsaussagen und
zuverlaessige naechste offene Geschaeftsentscheidung mit demselben Split pruefen.

Finales App-Gate: Wissensfrische, Lint, Typen, Build, 463 Unit-Tests bestanden;
53 umgebungsgebundene Tests uebersprungen. 22 fokussierte Assistant-Tests
einschliesslich separater Modellwahl und Model-Mismatch-Ablehnung bestehen.
Kein neuer PostgreSQL-/Browser-/Cloud-Lauf fuer die reine Modelltrennung.
Vorherige 36 PostgreSQL-Nachweise bleiben historischer Nachweis des
unveraenderten Service-/Akzeptanzvertrags. #94 und A01-A24 bleiben offen bzw.
`not-qualified`. Laufzeit, Kundenchats, Migrationen, Token und Schluessel bleiben
unveraendert; kein Commit, Push oder Release.

## Assistant: semantischer Planer noch nicht aktiviert

Lokaler Implementierungsstand 2026-10-10 nach Zustimmung zum gemeinsamen
Gespraechs-/Aenderungsvertrag; kein Laufzeit-Rollout dieser Fassung:

- Explizite Backend-Aenderungsrechte statt pauschaler Freigabe aller
  nicht-sensitiven Skalare: Firmenname, Firmenkuerzel, Region und bestehende
  native SNA-Patches. Firewall-Admin-Benutzername, API-Secret-Version und
  Bootstrap sind Operator-Eingaben, keine Geschaeftsentscheidungen und keine
  Chat-Patches. Auch gespeicherte alte Vorschlaege werden erneut validiert.
- Semantische Themen-/Modusplanung vor der Antwort; Eingrenzung auf relevantes
  Wissen, keine fest ersetzten Antworten. Firewall-Entscheidungen werden aus
  woertlichen Benutzer-Belegen rekonstruiert: Verkehrswege, Kapazitaet, Betrieb.
  Assistant-Beispiele gelten nicht als Zustimmung. Maximal eine naechste Frage
  und 800 Zeichen Erklaerung, keine Firewall-Infrastruktur-Uebersetzung.
- 21 fokussierte Assistant-Tests und Typpruefung bestehen. Alle 36 echten
  PostgreSQL-Identity-Faelle einschliesslich Ablehnung eines gespeicherten
  Bootstrap-Patches bestehen auf der isolierten Testdatenbank. Kein neuer
  Migrationseingriff; angewandte Migrationen 001-056 bleiben unveraendert.
  Finales App-Gate: Wissensfrische, Lint, Typen, Build und 462 Unit-Tests
  bestanden; 53 umgebungsgebundene Tests uebersprungen. Kein neuer Browser-
  oder vollstaendiger Cloud-/A01-A24-Qualifikationslauf fuer diesen Planer.
- Reale synthetische Qwen-Proben bestaetigen Teile des mehrstufigen
  Firewall-Ablaufs. Der explizite Themenwechsel zur SNA funktioniert in der
  letzten Probe, aber die ausdrueckliche Anforderung eines vollstaendig
  spezifizierten SNA-Vorschlags wird wiederholt als `advice` statt `draft`
  klassifiziert. Dadurch entsteht kein nativer Vorschlag. Beispiele, begrenzte
  Vorabeinordnung und Weglassen der Transport-Enums haben dies nicht behoben.
- Blocker: verlaessliche semantische Intent-Erkennung vor Rollout nachweisen,
  insbesondere Beratung versus Vorschlagsvorbereitung und SNA-Rundlauf nach
  Firewall-Historie. Die erlaubten Backend-Rechte duerfen dafuer nicht erweitert
  oder durch Wort-Trigger und vorgefertigte Antworten umgangen werden.

Keine Aktivierung des neuen Planers: lokale API und Benutzerchats wurden fuer
diesen Arbeitsstand nicht neu gestartet oder veraendert. Die zuvor dokumentierte
Laufzeitfassung bleibt aktiv; die neuen Operator-Sperren sind dort deshalb noch
nicht aktiv. Kein Kunden-Chat wurde fuer die Proben verwendet. Kein Cloud-Plan,
Apply, Destroy, Token-/Schluesselwechsel, Commit, Push oder Release. A01-A24
bleiben `not-qualified`. Keine Benutzerabnahme dieses Planers anfordern, bevor
die konkrete technische Fehlergrenze behoben ist.

## Verbindlicher erster Wurf: GitHub-MVP und Small-Issues

Benutzerentscheidung 2026-10-09: Alle MVP-markierten GitHub-Issues werden in der
Gesamtbetrachtung gefuehrt, zusaetzlich alle offenen `effort:s`-Issues im ersten
Wurf. Live-Abgleich der paginierten GitHub-API am 2026-10-09T19:11:37Z: Die Labels
heissen `mvp:required` und `effort:s`. Sieben MVP-Issues, davon sechs offen und
eines geschlossen; drei weitere offene Small-Issues, keine Ueberschneidung.
Geschlossene Issues bleiben abgenommene Referenz, keine erneut offene Arbeit.
Vor finaler Abnahme Labels, Zustand und alle Issue-Kriterien erneut abgleichen.

| Issue | Label | GitHub-Status | Umfang im ersten Wurf |
|---|---|---|---|
| [#89](https://github.com/stackitcloud/stackit-landing-zone/issues/89) | mvp:required | Offen | Editor-Ausfuehrungsfaehigkeiten einzeln nativ qualifizieren; private Kubernetes-/Firewall-Voraussetzungen sichtbar halten |
| [#90](https://github.com/stackitcloud/stackit-landing-zone/issues/90) | mvp:required | Offen | Platform-Apply, dauerhafter State, Migration, Folgeplan, unterbrochene Runner und Operator-Recovery; reale Teilfehler-/Restore-Abnahme |
| [#91](https://github.com/stackitcloud/stackit-landing-zone/issues/91) | mvp:required | Offen | Least-Privilege/Provider-Vertrag, begrenzte Application-Grants und Live-Widerruf, zwei Organisationen, veraltete Sessions/Jobs und gehosteter Login-Client |
| [#92](https://github.com/stackitcloud/stackit-landing-zone/issues/92) | mvp:required | Geschlossen | Unveraenderliche tenantgebundene Template-Veroeffentlichung ist abgenommen; bestehende Abnahme erhalten |
| [#93](https://github.com/stackitcloud/stackit-landing-zone/issues/93) | mvp:required | Offen | Qualifiziertes Runner-Artefakt/Dispatch, Quoten, kein doppeltes Projekt, ausdrueckliche Upgrade-Plans, separate States/Locks und Application-Plan-/Apply-/Recovery-Abnahme |
| [#94](https://github.com/stackitcloud/stackit-landing-zone/issues/94) | mvp:required | Offen | Begrenzter Backend-/UI-Model-Serving-Assistent, versioniertes Wissen, validierter bestaetigter Diff, Tenant-/Secret-/Injection-Schutz, Limits und echter Roundtrip |
| [#95](https://github.com/stackitcloud/stackit-landing-zone/issues/95) | mvp:required | Offen | Finale Revision/CI/native Contracts/Katalogkonsistenz, Live-Isolation/Recovery, Restore/Rotation, Kapazitaet/Cleanup/Migrations-/Release-Rollback, Branchschutz/PR/Secret-Scan und separate Merge-Freigabe |
| [#84](https://github.com/stackitcloud/stackit-landing-zone/issues/84) | effort:s | Offen | Standalone-Beispiel explizit Public, bestehender Root-Default bleibt erhalten, nativer Offline-Vertrag und aktuelle Kataloge ohne Umschreiben alter Revisionen |
| [#82](https://github.com/stackitcloud/stackit-landing-zone/issues/82) | effort:s | Offen | Folder-Beschreibung unterstuetzt durchreichen oder ausdruecklich ablehnen/deprecaten; Typen/Dokumentation/UI konsistent, kein stilles Verwerfen |
| [#59](https://github.com/stackitcloud/stackit-landing-zone/issues/59) | effort:s | Offen | Behauptete time-Provider-Warnung pruefen und leeren Block konsistent bereinigen; Provider-Deklaration, Lock und native Initialisierung erhalten |

`effort:s` ist eine Aufwandseinschaetzung, kein Nachweis eines einfachen oder
bereits abgenommenen Fixes. Lokale Implementierung, Build, Rollout und echte
Abnahme sind getrennte Zustaende. Alle GitHub-Kriterien bleiben massgeblich,
auch wenn Teilfunktionen lokal weiter sind als das Issue. Abhaengigkeiten wie
#69 oder #37/#80 werden geprueft, nicht stillschweigend als weiterer neuer
Funktionsumfang versprochen. Private Ausfuehrung bleibt ohne Nachweise gesperrt.

### Groessere Lieferpakete

1. Small-Issues und Ausfuehrungsvertrag: #84/#82/#59 samt nativen Tests,
  Katalog-/Dokumentationsabgleich und den zugehoerigen #89-Grenzen.
2. Durchgaengige Ausfuehrung und Recovery: #90 plus State-/Dispatch-/Recovery-
  Kriterien aus #93, aktuelle Adapter-Nachweise, Entscheidungslogik, explizite
  Operator-Aktion, UI und durchgaengige Fehlerfalltests zusammen qualifizieren.
3. Application-Self-Service: Quoten, idempotente Erstellung und ausdrueckliche
  Upgrade-Plans aus #93; #92-Altversionen und bestehende Instanzen erhalten.
4. Begrenzter Assistent: #94 als kompletter Backend-/UI-/Validierungs-/Limit-
  Workflow, nicht nur ein Modell-Endpunkt.
5. Live-/Betriebs-/Lieferabnahme: offene #91/#95-Kriterien und echte #90/#93-
  Nachweise, finaler Build, kontrollierter Rollout, Release und Merge-Entscheid.

Identitaet, Rechte, Isolation und Secret-Schutz aus #91/#95 sind in allen Paketen
Pflicht-Gates. Kleine Edits und fokussierte Tests bleiben intern; gearbeitet wird
eigenstaendig bis zum fachlichen Paketabschluss, nicht bis zur naechsten Migration.
Nur notwendige menschliche Voraussetzungen oder konkrete Cloud-/Release-Freigaben
unterbrechen die Umsetzung. Eingriffe stehen unten in der Benutzerabnahme.
Keine Issue-Schliessung oder Ausfuehrungsfreigabe allein aus lokalen Teilnachweisen.

## Small-Paket: lokal qualifiziert

#84, #82 und #59 sind im aktuellen Arbeitsstand zusammen umgesetzt und lokal
qualifiziert. Die GitHub-Issues bleiben offen; dieser Nachweis ist weder ein
Release noch eine Cloud-/Merge-Abnahme.

- #84: Das reale Standalone-Beispiel setzt `corporate = false`; Root-Eingaben
  ohne Flag behalten den Corporate-Default und verlangen weiterhin Konnektivitaet.
  Aktueller Katalog und beide Input-Inventare wurden deterministisch regeneriert.
  Altimporte werden nicht umgeschrieben und behalten ihre Corporate-Semantik.
- #82: Das gepinnte STACKIT-Provider-Schema 0.114.0 unterstuetzt keine Folder-
  Beschreibung. Root und direkter Governance-Aufruf lehnen nichtleere Werte
  ausdruecklich ab; fehlende, `null`, leere und reine Leerraum-Werte bleiben
  kompatibel. Das Governance-Objekt behaelt das Feld fuer diese Validierung,
  statt es stillschweigend aus der Eingabe zu entfernen. Der vorhandene Editor
  blendet das nicht unterstuetzte Feld bereits aus und nennt die Einschraenkung.
  Die generierten Root-/Governance-READMEs enthalten den aktuellen Vertrag.
- #59: Nur der redundante leere Root-Block `provider "time" {}` wurde entfernt.
  Version, Required-Provider-Deklaration und historische Lock-Dateien bleiben
  erhalten. Frisches backendfreies Init/Validate und Mock-Provider-Aufloesung
  bestehen. Die behauptete Proxy-Deprecation liess sich nicht reproduzieren;
  bestehende Kubernetes-Deprecation-Warnungen sind davon unabhaengig.

Qualifikation: 14 native Root-/Governance-Vertraege einschliesslich echter
Standalone-tfvars-Auswertung und Provider-Schema-Check; Format/Validate bestanden.
Go 1.27.1/Node 24.21.0: Katalog-/Inventar-Frische und echter HCL-Import-/Export-
Rundlauf bestanden. App-Gate: Lint, Typen, Build, 436 Unit-Tests bestanden,
53 umgebungsgebundene Tests uebersprungen. Finaler Build: 278 Desktop-/Mobilfaelle
bestanden. Keine neue DB-Migration oder Benutzer-API-Aktivierung fuer dieses Paket.
Historische Veroeffentlichungen, Runner-Pakete, Plans und Source-Pins bleiben
unveraendert. Neue Cloud-Ausfuehrung benoetigt weiterhin ein separat qualifiziertes
und freigegebenes aktuelles Paket; kein bestehender Plan wird umgebunden.

## Application-Self-Service: zusaetzlicher Retry-Nachweis

Der vorhandene transaktionale Idempotenz-Vertrag wurde auf echtem PostgreSQL
zusaetzlich ueber eine neue Service-Instanz mit eigenem Runtime-Pool geprueft:
acht parallele Wiederholungen derselben bereits gespeicherten Bestellung liefern
dieselbe Instanz, unveraenderte Einstellungen und denselben State-Key. Es bleibt
genau eine Bestellung. Eine neuere Template-Veroeffentlichung aendert diese
Bindung nicht. Es wurde kein Runner gestartet oder Cloud-Projekt erzeugt.

Alle 31 echten Identity-/PostgreSQL-Faelle bestehen auf dem separaten synthetischen
Container mit `--testTimeout=30000`; Format und Typpruefung bestehen. Einzelne
Suite-Faelle benoetigen vorher angelegte gemeinsame Identitaets-Fixtures. Beim
Standardlimit von fuenf Sekunden brach ein anderer Plattformvertragsfall ab;
der abschliessende Sessionfall scheiterte danach ebenfalls. Der vollstaendige
Lauf mit 30 Sekunden besteht ohne abgeschwaechte Assertions oder Codeaenderung
an diesen Faellen. Finales CI muss mit seinem tatsaechlichen Zeitbudget bestehen.

#93 bleibt offen: Quoten sind noch nicht implementiert; insbesondere darf ein
Application-Owner-Zaehlpfad unter RLS nicht als vollstaendiger Tenant-Zaehler
verwendet werden. Auch explizite Instanz-Upgrades, reale Cloud-Projekt-Idempotenz,
Locks und Recovery bleiben getrennte Akzeptanzkriterien, kein Schluss aus diesem
Bestellnachweis. Die Benutzer-Datenbank und laufende API bleiben unveraendert.

## Assistent: bestaetigter Konzeptumfang (2026-10-10)

Die Produktentscheidungen fuer #94 stehen in [Planung, Abschnitt 11](planning.md#11-chatbot-mit-stackit-model-serving): heutige Configurator-Komponenten einschliesslich komplexer Abhaengigkeiten, Vorlagenauswahl und Rueckfragen, bestehende und neue Application-Template-Entwuerfe, revisionsgebundener Chat-Arbeitsentwurf mit ausdruecklichem Gesamt-Diff sowie kontrollierte Wissensaktualisierung. Qwen3-VL 235B bleibt konfigurierbar. Keine Bilder und keine monetaere Budgetgrenze im MVP; aktuelle Anmeldung, Tenant-/Konfigurationsrechte, Aufgabenbindung und technische Missbrauchs-/Betriebslimits bleiben Pflicht.

Bestaetigt: Gespraeche sind persistent und nach Wiederanmeldung fortsetzbar, verpflichtend an Workspace und Konfiguration gebunden. Elternloeschung entfernt zugehoerige Gespraeche einschliesslich abgeleiteter Daten; spaete Modellantworten duerfen sie nicht wiederherstellen. Maximales Alter: drei Kalendermonate ab Erstellung, ohne Verlaengerung durch Fortsetzung. Nach Ablauf kann die bestehende Konfiguration neu analysiert werden. Backup-/Restore- und Bereinigungsnachweise gehoeren zur Abnahme.

Die KI-Abdeckung muss dauerhaft 1:1 allen implementierten Configurator-Features entsprechen, einschliesslich komplexer Komponenten; eine versionsgebundene Feature-/Testmatrix ist Release-Gate. MVP-Lastziel: fuenf gleichzeitige Chat-Sitzungen, kein Limit fuer gespeicherte Gespraeche. Referenzkonfigurationen und messbare Antwortzeitziele werden beim Spike praezisiert. Kein Chat-/Inferenz-, Loesch- oder Lastnachweis allein aus diesem Beschluss.

GitHub-Pflege: `gh` ist angemeldet; Fortschrittskommentare zu #84/#82/#59/#90/#93 und der Konzeptbeschluss zu #94 wurden am 2026-10-10 veroeffentlicht und verifiziert. Alle Issues bleiben offen. Kein Commit, Push, Release oder Benutzer-DB-/Cloud-Eingriff.

### Feature-Matrix: erster qualifizierter Konzeptschritt

[Dialog-/Abnahmespezifikation](assistant-feature-coverage.md) und
[maschinenlesbare Matrix](assistant-feature-coverage.json): 29 Root-Eingaben,
acht Gruppen, 501 Feld-/Containerpfade (davon neun geschuetzt), fuenf
Workflow-Bereiche und 24 Szenarien. Quellhashes und ein neuer Test in der
vorhandenen Common-Configuration-Suite pruefen Frische, Szenariozuordnung und
Secret-Grenzen. Jeder Eintrag bleibt `not-qualified` fuer die KI-Abnahme.

Lokale Nachweise: 26 fokussierte Tests bestanden; kanonischer App-Gate mit Lint,
Typen, Build und 437 Unit-Tests bestanden, 53 umgebungsgebunden uebersprungen.
Keine neue UI-/DB-/Runner-Aktivierung; die Browsersuite wurde fuer diesen
Konzept-/Testschritt nicht erneut ausgefuehrt. Keine Modellinferenz und keine
Cloud-/State-Aenderung. Die letzte Browserqualifikation bleibt der vorherige
Recovery-/Small-Build mit 278 Faellen.

Naechste Qualifikation: versionierte bereinigte Wissensversorgung und Modell-
Spike, dann persistenter autorisierter Dialog-/Vorschlagsvertrag mit Lifecycle,
Gesamt-Diff und realen A01-A24-Evaluationen. Antwortzeitziele bleiben bis zur
Messung offen. Ein aktuelles Matrix-JSON allein ist kein 1:1-KI-Nachweis.

## Arbeitsgrenzen

### OPNsense-HA nach PR-Review und kurze Beratung (2026-10-10)

Nutzer kritisierte langen Firewall-Einstieg und unvollstaendiges HA-Wissen.
GitHub-Zugang geprueft; PR #32 ist OPNsense-Wechsel, #51 VPN/Firewall-Policy.
HA-Commits d7633e2 und 1fb8f0c sind dem gemergten PR #55 zugeordnet.
Aktueller Code belegt zwei Knoten in unterschiedlichen Zonen, Unicast-CARP
mit LAN-VIP als Plattform-Next-Hop, pfsync ueber LAN und XMLRPC-Synchronisation.
Expliziter Post-API-Sync repliziert Aliases/Kategorien/Regeln/NAT/statische
Routen: API-Schreibzugriffe alleine loesen keinen automatischen Policy-Sync aus.
Backup hat eigene WAN-IP fuer Administration/Egress; primaere oeffentliche
IP bleibt NIC-gebunden. Inbound-Umschaltung braucht separate Behandlung,
beispielsweise manuelles DNS-Repointing. Diese Grenze bedeutet nicht fehlende HA.

Firewall-Infrastrukturwissen Version 2 ergaenzt die konkreten Funktionen,
PR-Herkunft und Policy-Sync-Quellen; kompakter Text bleibt im Kontextbudget.
Der native DE/EN-Beratungseinstieg ist auf kurze Erklaerung (<500 Zeichen DE)
und eine einzige Rueckfrage zum Verkehrsumfang reduziert. Bereits geforderte
zentrale HA wird bestaetigt, nicht erneut zur Entscheidung gestellt.
Kapazitaet und Betrieb sind nachfolgende Entscheidungen, keine Fragewand.
Die neue Fassung ersetzt die lange dreifragige Einstiegserklaerung unten.
Der Einstieg bleibt fest/vertragstreu, kein vollstaendig adaptiver Dialognachweis.

16 fokussierte Tests, Wissensgenerierung/Budget/Frische, Lint/Typen/Build und
457 Unit-Tests (+53 Skips), IDE und diff bestanden. Keine erneute Live-Modell-
Inferenz, Browser-/DB-Suite oder Cloud-Failover-Pruefung fuer diese Wissens-/
Textkorrektur; HA-Implementierung ist nicht gemessene Live-Ausfallqualifikation.
Lokal API health OK/UI 200; Konfiguration und Gespraech je ein Datensatz vor/
nach Restart identisch (Fingerabdruecke 724ebbb59b58faf91b57dfdafea5d46f und
032a8f3dd794e28100ec927f9d691227). Keine Migration/Cloud-Ausfuehrung oder
Nutzernachricht; vorhandenes Gespraech kann mit neuem Wissen weiterlaufen.
Keine neue Firewall-Patchberechtigung, A01-A24 weiterhin not-qualified.

### Firewall-Entscheidungsberatung: Modell-/Typvertrag (2026-10-10)

Nutzerfrage nach zentraler hochverfuegbarer Firewall und den dafuer noetigen
Entscheidungen scheiterte mit assistant_inference_failed/proposal_schema.
Synthetisch echt reproduziert: Modell erzeugte firewall_bootstrap als string;
Transport erlaubte beliebige Skalartypen je Pfad, Backend lehnte korrekt ab.
Transport bindet nun jeden Skalarpfad an seinen nativen Typ und Optionalitaet.
Firewall-Entscheidungsfragen bekommen changes.maxItems=0, hoechstens drei
native Firewall-Fragepfade und eine entsprechende Laufzeit-Scope-Pruefung.
Keine Bootstrap-Aktivierung durch die Beratung.

Echte Modellproben zeigten nach Typfix zusaetzlich unpassende Aktiv/Aktiv-
Optionen, Bootstrap-Fragepfade sowie nicht garantierte Public-IP-/Transfernetz-
Aussagen. Der initiale Entscheidungsdialog wird deshalb wie der SNA-Einstieg
auf eine feste native Entscheidungshilfe normalisiert (DE/EN), nicht als
vollstaendig freie Fachantwort weitergegeben. Sie nennt OPNsense Aktiv/Passiv
mit CARP, getrennte Zonen, LAN/WAN/HA-Adressen im SNA-Pool, kein zugesichertes
automatisches Public-IP-Failover und keine automatische Erzwingung aller
Verkehrswege. Fragen: Verkehrsumfang/Ausnahmen, Kapazitaet, tolerierbare
Unterbrechung/Betrieb. Rueckfragen zu Leistungsangeboten ohne Entscheidungs-
Einstieg bleiben im bisherigen Produktkatalogpfad. Kein neuer Firewall-Patch.

Nachweise: 16 fokussierte Tests inkl. genauer Nutzerfrage, optionalem Boolean-
Schemaschutz, drei Firewall-Pfaden, HA-Grenzen und Ablehnung einer trotz Schema
gelieferten Mutation. Frische/Lint/Typen/Build und 457 Unit-Tests (+53 Skips)
sowie IDE-Diagnostik bestanden. Finale echte synthetische Qwen-Probe 7479 ms:
0 Aenderungen, 3 passende Fragen, native Referenzen, Aktiv/Passiv und fehlende
Public-IP-Failover-Garantie korrekt. Zwischenproben nicht als fachlich bestanden
gewertet. Keine Nutzer-Konfiguration/Historie ans Modell, keine Nachricht im
Nutzergespraech abgesendet; Browser-/DB-Suiten hier nicht wiederholt.

Lokal aktiviert: API health OK/UI 200, Schema weiter 056. Konfiguration und
Gespraech vor/nach Restart identisch (je 1; Fingerabdruecke
724ebbb59b58faf91b57dfdafea5d46f / d5398264832129f666ff906c278db1c0).
Nutzer kann dieselbe Nachricht im bestehenden Gespraech erneut senden, ohne
Reload oder Loeschung. Keine Cloud-Ausfuehrung, Commit/Push; umfassende adaptive
Firewall-Beratung und A01-A24 weiterhin nicht vollstaendig qualifiziert.

### Wissenswechsel ohne Gespraechsneustart (2026-10-10)

Benutzerentscheidung: Ein Wissensupdate darf gespeicherte Gespraeche nicht
blockieren. Diese Regel ersetzt alle unten historischen Hinweise, nach einem
Wissenshashwechsel ein neues Gespraech zu starten. Jede neue Nachricht verwendet
das aktuelle Bundle zusammen mit der bestehenden Historie und dem weiterhin
gueltigen Vorlagenkontext. Erst die erfolgreich gespeicherte Antwort ersetzt
atomar Vorschlag und Wissenshash unter der bestehenden Revisionskontrolle.
Gespraechs-ID, Historie und absolutes Ablaufdatum bleiben erhalten. Fehler,
Loeschung, abgelaufene Gespraeche und parallele Aenderungen bleiben abgesichert.

Alte Vorschlaege sind als stale markiert und duerfen nicht unveraendert mit
neuem Wissen uebernommen werden; eine weitere Nachricht erzeugt einen aktuell
validierten Vorschlag im selben Gespraech. Vorlagenberatung konnte bereits
weiterlaufen; alte Empfehlungen bleiben bis zur Neubewertung stale.
Lifecycle-Thema Version 2 und Wissens-README dokumentieren den Vertrag.
Migration 056 ergaenzt nur UPDATE(knowledge_hash); kein UPDATE(expires_at),
keine Datenumschreibung oder Aenderung angewandter Migrationen 001-055.

Nachweise: gezielter echter PostgreSQL-Test fuer alten Hash, gesperrte alte
Uebernahme, gleichen Verlauf/ID/Ablauf, aktuellen Modellkontext/neuen Hash
und anschliessende ausdrueckliche Uebernahme bestanden. Alle 36 DB-Tests mit
30-Sekunden-Testlimit bestanden; erster paralleler Lauf hatte einen Timeout
und einen Session-Folgefehler. Frische/Lint/Typen/Build, 456 Unit-Tests
(53 Skips), IDE-Diagnostik bestanden. Browser read-only: authentifizierte
Session, Konfigurationsliste und bestehendes Gespraech jeweils 200, zwei
Nachrichten erhalten, alter Vorschlag stale. Keine Nachricht fuer den Nutzer
abgesendet, kein Editor-Reload oder neue Modellinferenz fuer diesen Fix.

Lokal aktiviert: API health OK, UI 200, Migration 056 angewandt. Konfiguration
weiter 1 Datensatz/Fingerabdruck 724ebbb59b58faf91b57dfdafea5d46f; Gespraech
weiter 1 Datensatz/Fingerabdruck d5398264832129f666ff906c278db1c0 vor/nach
Restart identisch. Kein Cloud-Lauf, Commit/Push oder Historienverlust.
Nutzerabnahme: Im vorhandenen Gespraech die bisherige Nachricht erneut senden;
kein neues Gespraech erforderlich. A01-A24 bleiben weiterhin not-qualified.

### Wissen fuer alle Accelerator-Bereiche (2026-10-10)

Die ersten SNA-/Credential-Dateien sind auf 19 kuratierte Themen erweitert:
Grundlagen, Governance, Management/State/Secrets Manager, Observability, Audit,
Federation, SNA, DNS, Firewall-Infrastruktur, Policy, Zugangs-/Bootstrapphase,
VPN, DevOps/Git, Plattform-Kubernetes/KMS/Bastion, Projekt-/Application-Templates,
Sandboxes, Namespace-Dienste sowie Pflichtwissen zu Credentials und Lebenszyklus.
[Architektur und Themenkatalog](assistant-knowledge/README.md) dokumentieren
den Erweiterungsweg und alle Themen mit Quellen-/Abhaengigkeitszuordnung.

Manifest hat jetzt explizite native Root-Eingaben. Alle 29 aktuellen Eingaben
muessen abgedeckt sein; unbekannte/fehlende Zuordnungen schlagen fehl. Alle
A01-A24 haben Themenzuordnungen, aber weiterhin Status not-qualified.
Die vorhandenen 501 Katalogpfade bleiben Feldautoritaet; Root-Zuordnung ist
kein vollstaendiger semantischer oder Dialognachweis fuer jedes Unterfeld.
Credential- und Lebenszykluswissen sind zwingend, Wissensabhaengigkeiten
aktivieren keine optionalen Dienste. Auswahl weiter explizit ueber Gruppen,
kein semantischer Retriever; aktuelle Editor-Requests enthalten alle Themen.

Globaler Vertrag und Themen trennen Vorlagenwerte von Nutzerfreigaben:
spaetere Firewall bedeutet keine Einrichtung jetzt. Bereits aktive geerbte
Werte und Widersprueche muessen separat erklaert werden, nicht still ersetzt.
Ein SNA-Patch ist keine selektive Cloud-Ausfuehrung; ein voller Accelerator-
Apply beinhaltet Pflichtressourcen und alle eingeschalteten Komponenten.
Keine neuen Chat-Patchrechte, kein freies Terraform/YAML oder hidden Credentials.
Komplexe Dienstepatches, komplette Cross-Feature-/CIDR-Validierung und
Credential-/Ausfuehrungsparitaet bleiben eigene Einfuehrungs-/Abnahmepunkte.

Review des Kontextbudgets: maximal 20 Themen, 8000 Zeichen pro Thema,
48000 insgesamt. Ueberhang wurde durch Kuerzung doppelter Erlaeuterungen
behoben, nicht abgeschnitten. Aktuell 47942 Zeichen; kompletter Kontext mit
Metadaten 145831 Bytes. Erweiterungen brauchen bewusste Budgetpruefung.
Lokale Terraform-/Markdown-/Domain-/API-Quellen werden gehasht, Inhalte der
Quelldateien nicht als Provenienz gesendet. Keine .local-/State-/Credential-
Dateien als Quellen. Externe Live-Dokumentationsversorgung/Promotion offen.

Nachweise: 41 fokussierte Tests; Frische/Lint/Typen/Build und 456 Unit-Tests
(+53 Skips) bestanden, IDE-Diagnostik sauber. Vier echte synthetische Qwen-
Checks: SNA-zuerst/spaetere-Firewall empfiehlt Hub & Spoke ohne Firewall
(12766 ms); Firewall/Policy/VPN (4436 ms) und Kubernetes/Namespaces (3401 ms)
mit neuen Themenreferenzen, ohne Aenderung; SNA-Patch (2493 ms), ein Vorschlag,
keine Frage, native Kompilation/tfvars erfolgreich. Breitere Antworten noch
knapp, teilweise doppelte Referenzen: keine vollstaendige fachliche Paritaet.
Keine Kundendaten/Konfigurationen an Modell uebertragen oder Cloud ausgefuehrt.
Browser-/PostgreSQL-Suiten fuer den reinen Wissensschritt nicht wiederholt.

Lokal aktiviert: API /healthz OK, UI 200, anonyme Session 401. Eine aktuell
gespeicherte Konfiguration vor/nach Restart unveraendert, Fingerabdruck
724ebbb59b58faf91b57dfdafea5d46f. Schluessel und Migrationen 001-055 erhalten.
Neuer Wissenshash blockiert alte Gespraeche/Vorschlaege wie bisher; fuer eigene
Abnahme explizit neues Gespraech starten. Keine automatische Loeschung/Migration
oder Aenderung an bestehenden Firewall-/Vorlagenwerten, kein Commit/Push.

### Template-Beratung loeschen: bodyloser DELETE (2026-10-10)

Wiederholtes Loeschen im echten Browser blieb wirkungslos. Ursache:
TemplateAdvice sendete Content-Type application/json auch bei DELETE ohne Body.
Fastify lehnt den leeren JSON-Body vor dem Handler ab; der Assistant-Fehlerhandler
meldete dies als HTTP 503 assistant_unavailable. Ohne Sitzung separat
diskriminiert: alter Aufruf assistant_unavailable, bodyloser Aufruf ohne JSON-
Header regulaer authentication_required. Kein DB-/Modell-Ausfall.

Frontend setzt Content-Type nur noch bei POST mit JSON-Body. Authentifizierung,
CSRF-Header, Loeschbestaetigung und serverseitige Loesch-/Cascade-Regeln bleiben
unveraendert. Vorhandenen HTTP-Test um bodylosen DELETE/204/Handler-Aufruf
ergaenzt; bestehende Browserregression prueft nun auch fehlenden Content-Type
und leeren DELETE-Body statt blindem Erfolg der Fixture.

Nachweise: 15 fokussierte Assistant-Tests, Typecheck/UI-Build und zwei
Desktop-/Mobil-Browserfaelle bestanden; scoped Biome und IDE-Diagnostik sauber
bis auf vorhandene unrelated non-null assertion im E2E-File. Die eigene
gewollte Loeschung im urspruenglichen Browser wurde nach Bestaetigung mit der
korrigierten Request-Form ausgefuehrt: HTTP 204, danach GET HTTP 200/advice null,
kein Loeschbutton/Fehler mehr. Da der Tab noch alten JavaScript-Code geladen
hatte, wurde dort nur der DELETE-Header normalisiert (kein Antwort-Mock,
keine Auth-Abschwaechung). Kein Reload/Verlust moeglicher Editorentwuerfe.

Neue Tabs/Reload laden den bereits gebauten Fix. Im alten Tab fuer kuenftige
Loeschungen nach Sichern ungespeicherter Arbeit neu laden. Keine Konfiguration
geloescht/geaendert, keine neue Migration, kein API-/Cloud-Restart oder Commit.

### VM-Wiederanlauf und Beratungsuebergabe (2026-10-10)

Nach VM-Absturz waren Nutzer-/Testdatenbank und lokale API/UI/Callback gestoppt.
Arbeitsdateien zur Beratungsuebergabe waren erhalten, jedoch nicht abschliessend
geprueft oder aktiviert. Zwei Typfehler im angefangenen Test-Mock und eine
Formatabweichung behoben. Vorhandene Container ohne Neuerstellung gestartet,
kein Backup, keine Cloud-Aktion, kein Commit/Push. Fuenf Nutzerkonfigurationen
vor/nach beiden API-Starts mit unveraendertem Fingerabdruck
8609f82bfe6b5be300feedd4cfbd5af3. Bestehende lokale Schluessel erhalten.

Migration 055 isoliert geprueft und danach auf der lokalen Nutzerdatenbank
angewendet; 001-055 sind ab jetzt unveraenderlich. Beim ersten Speichern einer
neuen Konfiguration kann die eigene aktuelle Template-Beratung ueber die
sichtbare Uebernahmeoption angehaengt werden. Browser sendet nur ID/Revision,
Server prueft Eigentuemer, Revision, Ablauf und Wissensstand transaktional.
Kontext bleibt getrennt von den 40 eigenen Chat-Nachrichten, erhaelt das
urspruengliche Ablaufdatum und wird bei Loeschung von Beratung/Konfiguration
mit geloescht. Das Modell bekommt ausschliesslich Rolle/Text, keine gespeicherten
Nachrichten-IDs. Keine automatische Nachruestung alter Konfigurationen.

Die urspruengliche SNA-Anfrage scheiterte im echten Gegencheck weiterhin an
proposal_schema: Modell lieferte einen ungueltigen SNA-Wert statt Rueckfragen.
Modell-Schema jetzt pfadgebunden: SNA nur als Netzwerkobjekt/Map und nur in der
zur aktuellen Konfiguration passenden nativen Form. Im SNA-ersten Schritt sind
Aenderungen ohne gueltige CIDR-Evidenz in aktuellen Werten/Nutzerangaben gesperrt;
CIDR-Beispiele frueherer Modellantworten zaehlen nicht. Das ist kein vollstaendiger
Anforderungsparser oder Nachweis freier/non-overlapping Adressbereiche.

Nachweise: Frische/Lint/Typen/Build und 456 Unit-Tests (+53 Skips); 36 echte
PostgreSQL-Integrationstests mit Uebernahme, Fremdzugriff, veralteter Revision,
unveraendertem Ablauf, gesperrtem Laufzeit-UPDATE und Loeschweitergabe;
vier bestehende Desktop-/Mobil-Browserregressionen fuer Beratung/Chat.
Letzte Modellbeispiel-Schutzkorrektur separat mit 15 fokussierten Tests,
Formatierung und Typecheck geprueft. Echte synthetische Qwen-Gegenchecks:
urspruengliche Anfrage 3334 ms, drei Rueckfragen, keine Aenderung; vollstaendig
spezifizierte SNA 2274 ms, ein Vorschlag, keine Frage, nativer Compiler/Export
erfolgreich. Kein Schreiben einer Nutzerkonfiguration, keine Cloud-Ausfuehrung.

Final lokal: UI HTTP 200 auf Port 4181, API /healthz OK auf 3000,
STACKIT-Callback lauscht auf 8000, anonyme Session ueber UI-Proxy HTTP 401.
Nutzerabnahme offen: ggf. erneut anmelden, neue Konfiguration mit der
Uebernahmeoption speichern und eigenen Dialog fortsetzen. Der konkrete
positive Checkbox-Uebernahmeablauf wurde nicht neu als Browser-E2E qualifiziert;
Backend-Uebernahme und vorhandene Browserablaeufe sind getrennt nachgewiesen.
A01-A24 bleiben not-qualified; allgemeiner Aufgabenplaner, umfassende CIDR-/Quota-
Pruefung und vollstaendige Feature-/Credential-Paritaet bleiben offen.

### Kuratiertes Service-Wissen als Markdown (2026-10-10)

#94: Verbindliche Wissensarchitektur implementiert und im
[Architektur-/Erweiterungsleitfaden](assistant-knowledge/README.md) dokumentiert.
Erste Bausteine: SNA und Credential-Grundlagen. Explizites Manifest mit Topic-ID,
Version, Pruefdatum, Feature-Gruppen, Pflichtflag, Abhaengigkeiten, lokalen
Quellen, externen Referenzen und A01-A24-Zuordnung. Acht feste Inhaltsabschnitte:
Zweck, Accelerator-Vertrag, Abhaengigkeiten, Dialog, Beispiele, Grenzen,
Credentials, Quellen. Keine Sammlung beliebiger Kundendokumente/Secrets.

Build-Weg: validierter Generator erzeugt ein eingebettetes TypeScript-Artefakt
mit Inhalts-/Quellenhashes und Engine-Bindung. Die API liest zur Laufzeit keine
Dokumentationsdateien. Topic-Auswahl folgt expliziten Feature-Gruppen und
Abhaengigkeiten; Credential-Grundlagen immer enthalten. Bestehende Editor-
Requests waehlen derzeit alle Gruppen: kein allgemeiner semantischer Retriever.
Auch die Template-Beratung verwendet die Bausteine. SNA-Fachtext ist aus der
doppelten hartkodierten Regel entfernt; Markdown-Text wird je Kontext nur einmal
als kuratierte Regel plus getrennte Provenienz geliefert.

Pflichtgate: knowledge:check vor dem App-Gate sowie Frischetest in vorhandener
Assistant-Suite. Geaenderte Inhalte/Metadaten/lokale Quellen machen das Bundle
veraltet; keine automatische Regeneration beim Build/Start. Grenzen: acht
Themen, 8000 Zeichen je Thema, 24000 insgesamt. Unbekannte Abhaengigkeiten,
Zyklen, doppelte IDs/Dateien, globale Regel-ID-Konflikte, fehlendes Credential-
Pflichtwissen, unstrukturierte/leere Themen und unzulaessige Quellen werden
abgewiesen. Externe Links sind Referenzen, keine Live-Abfrage oder automatische
Promotion. Markdown erteilt weder neue Patchrechte noch Ausfuehrungsfreigaben.

Nachweise: 41 fokussierte Assistant-/Common-Configuration-Tests; Pflicht-Frische-
gate, Lint/Typen/Build und 456 Unit-Tests (+53 umgebungsgebundene
Ueberspringungen) bestanden. Echter synthetischer Qwen-SNA-Test mit beiden
Bausteinen: 2526 ms, ein Vorschlag, keine Frage, gemeinsam kompiliert und
native tfvars exportiert. Keine Kundendaten, Credential-Abfrage oder Cloud-
Ausfuehrung. IDE-Diagnostik sauber. Browser-/PostgreSQL-Suiten fuer diesen
Wissensschritt nicht erneut ausgefuehrt; vorheriger SNA-Schreibnachweis bleibt
separat dokumentiert. Keine neue Migration.

Alle Themen bleiben local-draft-not-reviewed-release, A01-A24 nicht vollstaendig
qualifiziert. Weitere Service-Themen, systematische externe Quellenversorgung,
historische freigegebene Wissenspakete, Promotionsprozess, genereller Aufgaben-
planer und vollstaendige Credential-/Feature-Paritaet bleiben offen. Neuer
Wissenshash verlangt wie bisher ein neues Gespraech; alte Historie wird nicht
geloescht oder still migriert.

Lokale Aktivierung nach Gate: API /healthz und UI HTTP 200, anonyme Session 401.
Vier Konfigurationen vor/nach Restart mit identischem Fingerabdruck
ecc6b5e2a0b4bb310bff5900b818c9e8; Daten/Schluessel und Migrationen 001-054
erhalten. #94 Fortschrittskommentar
[6099543415](https://github.com/stackitcloud/stackit-landing-zone/issues/94#issuecomment-6099543415)
exakt verifiziert, Issue weiter offen. Fuer den eigenen Browser-Dialog ggf.
erneut STACKIT-Anmeldung und neues Gespraech starten; dies bleibt Nutzerabnahme.

### Strukturierte SNA und verbindlicher Accelerator-Vertrag (2026-10-10)

Neue verbindliche Benutzeranforderung: Der Assistent uebersetzt freie Sprache
und fachliches Wissen in das vorhandene Accelerator-Feature-Set, nicht in
freies Terraform. Konfiguration muss mit der passenden Accelerator-Version
auch ohne Configurator verwendbar bleiben. Konzept/Modul, Eingabeschema,
Fachmodell, Validierung, Import/Export, Editor/Assistent, Credentials und Tests
sind gemeinsame Feature-Vertraege, keine editor-exklusiven Optionen.
Siehe [gemeinsames Feature-Modell](common-feature-model.md#verbindlicher-accelerator-vertrag-2026-10-10).
Aktueller nativer Export ist tfvars. YAML wurde nicht als zweites Fachformat
eingefuehrt; dafuer waere ein expliziter versionierter Adapter erforderlich.

#94: Der bisherige Planungs-only-Stand fuer SNA ist durch einen schreibbaren
strukturierten Vorschlag ersetzt. Unterstuetzt: connectivity.network_area
(vorhandene Einzelbereich-Form) und connectivity.network_areas (Bereichs-Map).
Kein automatischer Format-/Regionalwechsel, keine Bereichsloeschung. Andere
Connectivity-Komponenten und bestehende Identitaeten bleiben erhalten; neue
Bereichsidentitaeten erzeugt nur der Server. Unbekannte importierte Felder
werden erhalten, aber nicht an das Modell gesendet. Modellkontext fuer SNA
enthaelt ausschliesslich explizit erlaubte, typgepruefte Netzwerkfelder.

Vor Anzeige und nochmals bei ausdruecklicher Annahme: striktes Patchschema,
IPv4-CIDR-/Resolverpruefung, gemeinsamer Compiler und Fachvalidierung. Neue
Konfigurationsfehler und Fehler im geaenderten SNA-Bereich blockieren den
Vorschlag; vorhandene Fehler ausserhalb des Bereichs bleiben dokumentierte
Entwurfsgrenzen. Der Export nutzt ausschliesslich den vorhandenen nativen
Accelerator-Compiler. Kein HCL-/Provider-/Ressourcenblock aus dem Modell.
Credentials bleiben separate sichere externe Bindings, keine Patchwerte.

Echter synthetischer Qwen-Rundlauf: 4115 ms, vollstaendig angegebener
Adresspool 10.64.0.0/16, Transfernetz 10.63.0.0/24, feste /24-Praefixe,
ein SNA-Vorschlag, keine Rueckfrage, gemeinsam kompiliert und als native tfvars
exportiert. Keine Kundendaten, Annahme oder Cloud-Ausfuehrung in diesem Lauf.
Anbieter-Schemablockaden propertyNames/cidrv4 (HTTP 400) gezielt behoben:
nur ununterstuetzte JSON-Schema-Schluesselwoerter im Modelltransport entfernt,
serverseitige Bereichsschluessel-/CIDR-Validierung unveraendert strikt.

Nachweise: 40 fokussierte Assistant-/Common-Configuration-Tests;
35 echte isolierte PostgreSQL-Identity-Faelle inklusive ungueltiger SNA,
keiner Entwurfsaenderung vor Zustimmung, Fremdzugriff-/Revisionsschutz,
Uebernahme in Revision 2 und nativer Exportierbarkeit. Kanonischer Gate:
Lint/Typen/Build und 455 Unit-Tests (+53 umgebungsgebundene Ueberspringungen)
bestanden. Strukturierter SNA-Diff, Wiederaufnahme, ausdrueckliche Annahme und
Layout-Overflow-Pruefung in zwei Desktop-/Mobil-Browserfaellen bestanden.
Vollstaendige Browser-Suite und native Provider-/Cloud-Ausfuehrung fuer den
generierten SNA-Entwurf nicht geprueft. Keine Migration oder Cloud-Mutation.

Offen bleiben: allgemeiner persistenter Aufgabenplaner und freie Rueckfrage-
Qualifikation; regionale Netzwerk-Patches, Loeschen/Umbenennen von Bereichen,
weitere komplexe Komponenten, vollstaendige Netzueberlappungs-/Kapazitaets-
und Zielprojekt-/Quotenpruefung sowie durchgaengige ausserhalb des Configurators
qualifizierte Credential-Bindings. A01-A24 bleiben not-qualified, keine
vollstaendige Feature-Paritaet aus dieser ersten strukturierten A04/A15-Scheibe.
Neuer Wissenshash verlangt ein neues Gespraech; alte Historie wird nicht vom
Agenten geloescht oder still migriert.

Lokaler Rollout abgeschlossen: API/UI HTTP 200, anonymer Assistent HTTP 401,
vier Konfigurationen mit gleichem Vorher-/Nachher-Fingerabdruck erhalten.
Eigener isolierter SNA-Testcontainer entfernt.
#94-Kommentar [6099387251](https://github.com/stackitcloud/stackit-landing-zone/issues/94#issuecomment-6099387251)
inhaltlich exakt verifiziert; Issue bleibt offen.

### SNA zuerst, Firewall spaeter (2026-10-10)

#94: Der konkrete Auftrag "Konfiguriere mir zuerst mein zentrales Netzwerk
ueber das meine ca. 100 Projekte kommunizieren sollen" ist als Regression
abgedeckt. Das Wissenspaket beschreibt jetzt die echte STACKIT Network Area
(SNA) mit Adresspool, Transfernetz, Projekt-Subnetzpraefixen und DNS sowie
OPNsense als derzeit unterstuetzte zentrale Firewall. Keine fremden Firewall-
Anbieter, AWS-VPC/Direct-Connect-Alternativen oder implizite Firewall-Ergaenzung.
Netzwerk-zuerst-Nachrichten begrenzen Fragepfade auf SNA und erlauben keine
skalaren Nebenveraenderungen. Firewall-/VPN-/Bootstrap-/Secret-Rueckfragen
werden auch bei einem scheinbar passenden SNA-Fragepfad abgewiesen, nicht
still akzeptiert. Fehlende Berechtigungen duerfen nicht erfunden werden.

Unveraenderte skalare Vorschlaege werden entfernt. Der SNA-Planungsstatus wird
deterministisch erklaert: nichts konfiguriert, verschachtelte SNA-Einstellungen
noch nicht im Chat schreibbar, Erfassung im Netzwerkeditor. Kein fingierter
Erfolg und kein Ersatz eines Netzwerkauftrags durch Firmen-/Owner-Aenderungen.
Die lokale Schritt-Erkennung ist bewusst begrenzt, kein allgemeiner persistenter
Aufgabenplaner. Fortsetzung nach Adressantworten, freie Fragezuordnung und
vollstaendige SNA-Aenderungen bleiben A04/A15-Abnahmepunkte.

Nachweise: 13 fokussierte Assistant-Tests, kanonischer Gate mit Lint/Typen/Build
und 454 Unit-Tests (+53 umgebungsgebundene Ueberspringungen) bestanden.
Echter synthetischer Qwen-Fall zunaechst fachlich abgewiesen: erfundene
Berechtigungsprobleme und externe Anbindungen. Nach expliziter Schrittprioritaet
4720 ms, SNA-Adressbereich, Projekt-Subnetzgroesse, Kommunikationsanforderung,
keine Firewall-/VPN-Frage, keine Aenderung. Danach deterministischen Status
ergaenzt, weil das Modell weiterhin "ich konfiguriere" behauptete; fokussierte
Regression und finaler App-Gate bestanden. Kein Kundendokument an das Modell.
Vollstaendige Browser-/PostgreSQL-Suite fuer diese eng begrenzte Korrektur nicht
erneut ausgefuehrt. Keine DB-Migration oder Cloud-Ausfuehrung.

Lokaler Stand aktiviert: API/UI HTTP 200, vier Konfigurationen mit identischem
Vorher-/Nachher-Fingerabdruck erhalten. #94-Fortschrittskommentar
[6099175269](https://github.com/stackitcloud/stackit-landing-zone/issues/94#issuecomment-6099175269)
inhaltlich exakt verifiziert; Issue bleibt offen.

Benutzereingriff: Das neue Komponentenwissen aendert den Wissenshash.
Bestehende Gespräche werden nicht umgeschrieben, sondern als veraltet blockiert
(assistant_knowledge_changed). Fuer den naechsten fachlichen Versuch ein neues
Gespraech ueber den bestehenden Chat-Loesch-/Neustartworkflow beginnen;
Konfigurationen bleiben erhalten. Vorhandene Gespraeche nicht durch den Agenten
loeschen. Keine automatische Migration alter Vorschlaege auf neues Wissen.

### Live-Produktwissen im Assistenten (2026-10-10)

#94: Pro Chat-/Template-Beratungsnachricht werden die eigenen autorisierten
Editor-Produktkataloge und öffentliche PIM-v2-Produkte/SKUs frisch abgerufen.
Fehler sind unabhängig sichtbar, Regionen getrennt, keine Betreiber-Credentials,
IAM-Daten oder Secrets im Modellkontext. Technische ID-Fragen sind gesperrt;
SKU-Artikelnummern sind keine VPN-Plan-IDs. Umfang und Kontextlimits stehen in
[Katalogdokumentation](cloud-product-catalogues.md#assistent-aktueller-pim-v2-abruf-2026-10-10).

Nachweise: 30 fokussierte Assistant-/PIM-Tests, 34 echte PostgreSQL-Identity-Fälle
auf isolierter Datenbank, vier fokussierte Desktop-/Mobilabläufe bestanden.
Der finale kanonische App-Gate besteht mit Lint, Typprüfung, Build,
453 Unit-Tests und 53 umgebungsgebundenen Überspringungen; vollständige
282-Browser-Suite für diesen Abschnitt nicht erneut ausgeführt.
Echter öffentlicher PIM-Abruf eu01: fünf Produkte, 330 SKUs, drei VPN-Pläne
mit 100/500/1000 Mbit/s. eu02: fünf Produkte und 129 SKUs, keine VPN-SKUs.
Keine Cloud-Konfiguration oder State-Änderung.

Echte synthetische Qwen-Tests: keine ID-Rückfragen und keine Änderung, aber
unvollständige Bandbreitenerklärung und teils fachlich unpassende Folgefragen.
Prompt und JSON-Schema allein lösen diese Qualitätsgrenze nicht. Die finale
Antwort ergänzt deshalb gelieferte Fakten deterministisch; freie Modellberatung
ist damit ausdrücklich nicht vollständig abgenommen. A01-A24 bleiben unverändert
`not-qualified`; verschachtelte VPN-Änderungen sind weiterhin nicht unterstützt.
Finaler echter synthetischer Qwen-Roundtrip mit Faktenliste: 5802 ms,
100/500/1000 Mbit/s enthalten, drei Fragen, keine ID-Rückfrage, keine Änderung.
Lokaler Neustart abgeschlossen: API/UI HTTP 200, anonymer Assistent HTTP 401,
drei Konfigurationen mit identischem Vorher-/Nachher-Fingerabdruck erhalten.
Eigener isolierter PostgreSQL-Testcontainer entfernt.

Benutzereingriff erforderlich: Die vorhandene Browser-Sitzung ist abgelaufen
(`/api/v1/session` HTTP 401). Erneut über STACKIT anmelden und die Beratung im
eigenen Workspace prüfen; keine Zugangsdaten im Chat. Noch offene Nachweise:
fachliche Fragequalität, RAM-Einheit, DE/EN-Faktenliste und
Projektbestellbarkeit/Quoten. Lokaler API-Neustart bleibt ohne Ausführung;
Migrationen 001-054 und bestehende Konfigurationen bleiben erhalten.

### Lokaler Wissens-/Inferenz-Spike (2026-10-10)

Siehe [Spikedetails und Aufruf](assistant-feature-coverage.md#lokaler-wissens--und-qwen-spike-2026-10-10). Implementiert: deterministischer Metadaten-/Regelentwurf mit Hash-/Revisionsbindung und ein ausschliesslich synthetischer Qwen-Client. Keine vollstaendige aktuelle STACKIT-/Modul-Wissensversorgung oder historische Wissenspakete behauptet. Sieben fokussierte adversariale Tests und kanonischer App-Gate mit 444 Unit-Tests, 53 umgebungsgebundenen Ueberspringungen, Lint/Typen/Build bestanden.

Token-Blocker eigenstaendig geloest: Mac-Transfer enthaelt `.local/github-platform-applied.tfstate` und `.local/platform/state.passphrase`, beide `0600`. Gepinntes OpenTofu liest ausschliesslich den lokalen Token-Output mit Originalschluessel; stdout bleibt im Operator-Prozessspeicher, Token nur in der Umgebung des Spike-Kindprozesses. Keine Secret-Ausgabe, kein Klartextfile, kein Remote-State-Pull, keine Rotation. Kein Benutzereingriff fuer diesen Roundtrip mehr erforderlich.

Echter synthetischer Roundtrip bestanden: `Qwen/Qwen3-VL-235B-A22B-Instruct-FP8`, 11983 ms, Template `standalone`, acht Fragen, fuenf Referenzen, `authorizesExecution=false`. Fuenf einzeln gestartete Aufrufe, vier abgewiesen und einer akzeptiert; keine automatischen Retries. HTTP 200 mit passendem Modell bestaetigt. Ausgabebudget nach nachgewiesener Trunkierung von 1200 auf 4096 Tokens erhoeht; bestehende Schema-Limits explizit im Prompt verankert, nachdem Qwen 19 Fragen lieferte. Validierung bleibt strikt; Test sichert Abweisung von neun Fragen. Sieben fokussierte Tests und kanonischer App-Gate mit 444 Tests/53 Ueberspringungen erneut bestanden. Einzelmessung ist keine Latenzzusage oder Lastabnahme; echte A01-A24-Qualifikation bleibt offen.

Kein neuer HTTP-Endpunkt, keine UI-/Benutzer-DB-/Runner-Aktivierung, keine Cloud-/State-Aenderung, kein Commit/Push/Release. Der Wissensentwurf bleibt `local-draft-not-reviewed-release`; Chat-Persistenz/Autorisierung/Lifecycle und vollstaendige Quellen-/Modellqualifikation bleiben offen.

- Eigenstaendige lokale Entwicklung und isolierte Tests sind beauftragt.
- Keine Kunden-Cloud-Plans, Applies, Destroys oder State-Aenderungen ohne separate
  ausdrueckliche Freigabe des konkreten Vorgangs.
- Migrationen 001-050, historische Runner-Pakete und gespeicherte Plans bleiben
  unveraendert. Neue Migrationen beginnen bei 051.
- Keine automatischen Retries, Erfolgskorrekturen, Schluesselrotationen oder
  zusaetzlichen Datenbank-Backups. Kein Commit, Push, Release oder Merge.
- Die Ubuntu-API laeuft derzeit im Login-Modus ohne native Ausfuehrung.
- Das freigegebene Browserfenster darf fuer MVP-Pruefungen und normale erneute
  Login-Versuche mit vorhandener SSO-Sitzung verwendet werden. Falls STACKIT
  Passwort, MFA oder eine andere manuelle Anmeldung verlangt, uebernimmt der
  Benutzer; keine Zugangsdaten oder Anmeldecodes im Chat erfassen.

### Netzwerkzugriff auf lokale Preview (2026-10-10)

Ursache bestaetigt: Preview lauschte nur auf `127.0.0.1:4181`. Ausschliesslich
den UI-Preview-Prozess mit `npm run preview --workspace=@lzc/web -- --host
0.0.0.0 --port 4181 --strictPort` neu gestartet; Loopback-Projektdefaults und
laufende API/DB unveraendert. `ss` bestaetigt `0.0.0.0:4181`; UI und
`/healthz` ueber `http://10.0.0.195:4181` liefern HTTP 200. Der Preview leitet
auch `/api` und `/auth` an die lokale API weiter; den freigegebenen Port nur
fuer vertrauenswuerdige Test-Clients zugaenglich halten, nicht oeffentlich betreiben.

Benutzerpruefung offen: Zugriff vom anderen Rechner durch die freigegebene
Netzwerkstrecke. Login ueber Server-IP ist nicht qualifiziert: STACKIT-CLI-Client,
Origin-Pruefungen und Cookies verlangen weiterhin die lokale Loopback-Origin.
Fuer authentisierte Tests UI 4181 und den aktuellen Callback 8000 per SSH an
`127.0.0.1` des Client-Rechners weiterleiten und dort `http://127.0.0.1:4181`
oeffnen. Callback-Port nach API-Neustart erneut pruefen; lokale Portkonflikte
vorher beheben. Dieser Netzwerk-Schritt selbst startete nur die Preview neu.
Die nachfolgende freigegebene Chat-Aktivierung ist unten getrennt dokumentiert;
keine Auth-Lockerung oder Runner-Aktivierung.

### Lokaler Chat im Editor (2026-10-10)

Jetzt aktiv: gespeicherte Konfiguration oeffnen, Panel `Konfigurations-Chat`
oberhalb des Editors. Nachricht, gespeicherter Verlauf, Rueckfragen und
getrennter Gesamt-Diff fuer maximal acht oeffentliche Einzelwerte.
`Gesamten Vorschlag uebernehmen` speichert ausdruecklich eine neue Revision;
keine Veroeffentlichung, Bestellung oder Infrastruktur-Ausfuehrung. Vorher
lokale Editor-Aenderungen speichern. Details und reproduzierbarer `dev:chat`-
Start: [Editor-Chat](assistant-feature-coverage.md#lokaler-editor-chat-2026-10-10).

Backend-Opt-in mit bestehenden Tenant-/Owner-/Plattformrechten, Origin/CSRF,
neuer Autorisierung nach Inferenz und Konfliktpruefungen. Migration 053:
Konfigurationsloeschung entfernt Gespraech/Vorschlag, spaete Antworten
koennen sie nicht wiederbeleben; unverlaengerbare Drei-Kalendermonats-Frist,
Start-/Minuten-/Zugriffs-Cleanup. Maximal fuenf Inferenzanfragen je Prozess;
40 Nachrichten je Gespraech. Modelleingaben enthalten nur freigegebene
Scalarwerte ohne IDs, Metadaten und begrenzte Chat-Historie, keine rohen
State-/Plan-/Credentialdaten. Secret-Musterheuristik ersetzt keine umfassende
DLP-/Injection-Abnahme.

Nachweise: zehn fokussierte Tests; 447 Unit-Passes/53 Skips plus Lint/Typen/
Build; 32 echte isolierte PostgreSQL-Faelle; vier fokussierte Desktop-/Mobil-
Chat-/Speicherfaelle mit einem Worker und 60s CLI-Grenze bestanden. Parallel
Desktop-Browser-Timeouts dokumentiert; volle 280er Suite nicht erneut behauptet.
Screenshots geprueft. Echter synthetischer Chat-HTTP-Test: 200 in 2649 ms,
gespeicherter Verlauf, ein Vorschlag, explizite Revision-2-Uebernahme, danach
synthetische Daten geloescht.

Benutzer hat lokale API-Neustarts, neue lokale Migrationen und bestehende
DB-Rollenpasswortrotation fuer Entwicklungsarbeit dauerhaft freigegeben.
API im Login-/Chat-Modus neu gestartet, Migrationen 051-053 angewendet;
eine vorhandene Konfiguration mit identischer Inhalts-/Revisionspruefsumme
erhalten, bestehende Schluessel unveraendert. UI und Health 200, anonymer Chat
401, Callback weiterhin 8000; keine Cloud-/Modeltoken-/Runner-Aktivierung.

Benutzerabnahme offen: im Browser Konfiguration oeffnen und echten Dialog
testen; geteilte Sitzung besteht, Seite war fuer den Connector-Klick nicht
sichtbar. Komplexe Strukturvorschlaege, Application-
Template-Drafts, vollstaendiger Analysekontext, aktuelle vertrauenswuerdige
Quellenpakete sowie A01-A24/Restore/Monatsenden/Fuenf-Sitzungs-Lastqualifikation
bleiben offen. #94 bleibt offen, keine Behauptung vollstaendiger KI-Paritaet.

### Template-Beratung vor einer Konfiguration (2026-10-10)

Lokal aktiv auf `Konfigurationen` und `Neue Konfiguration`, nach Anmeldung und
mit Plattformrechten: Anforderungen schildern, Rueckfragen beantworten,
begruendete bekannte Vorlage ueber `Vorlage ansehen` in der bestehenden
Vorschau pruefen. Keine automatische Konfigurationserstellung oder Aenderung
eines vorhandenen Entwurfs. Die Vorlagen teilen eine konfigurierbare Engine;
Netzwerk-/Firewall-/Regions-/Isolationsvorgaben bleiben wichtige Startentscheidungen,
nicht die Behauptung, jede spaetere Funktion sei bereits vollstaendig implementiert.

Migration 054: persoenliches Gespraech je Tenant/Benutzer, kein Eltern-Config-ID
noetig; persistierte Historie/Empfehlung, unverlaengerbare drei Kalendermonate,
40 Nachrichten, Tenant-FK-Cascade und Archiv-/Ablauf-Cleanup. Erneute aktuelle
Autorisierung nach Inferenz und revisionsgebundener Schreibschutz verhindern
spaete Wiederbelebung oder Ueberschreiben paralleler Antworten. Dasselbe
fuenf-Anfragen-Prozesslimit, Origin/CSRF und Secret-Musterpruefung wie beim Chat.
Ein veraenderter Wissensstand sperrt eine alte Empfehlung bis zur Neubewertung.
Auswahlgespraech bleibt im Arbeitsbereich; noch keine automatische Uebergabe
seiner Anforderungen in Editorwerte oder den separaten Konfigurations-Chat.

Nachweise: elf fokussierte Tests; 448 Unit-Passes/53 Skips plus Lint/Typen/Build;
33 echte isolierte PostgreSQL-Faelle; vier Desktop-/Mobilfaelle fuer Beratung
und Editorchat mit Screenshots ohne Seitenueberlauf. Echte synthetische Qwen-
HTTP-Beratung: 6757 ms, vier Rueckfragen, keine Empfehlung; nach Antworten
3146 ms, `hub-and-spoke`, keine weiteren Fragen; vier Nachrichten wieder geladen,
DELETE 204. Testaufbau zuerst mit falschem Cookie/Test-Origin korrigiert;
keine Benutzerkonfiguration fuer Inferenz verwendet. Keine Vollabdeckung oder
Lastqualifikation aus diesen beiden Modellantworten.

Lokaler freigegebener API-Neustart/DB-Rollenrotation mit Migration 054 bestanden;
zwei vorhandene Konfigurationen mit unveraendertem Inhalts-Hash, bestehende
Schluessel erhalten, UI und `/healthz` 200, anonyme Beratung 401. Keine Cloud-
Ausfuehrung, Tokenrotation, Veroeffentlichung oder Release.

Benutzerabnahme offen: echte eigene Anforderungen vor Oeffnen einer
Konfiguration beraten lassen, Rueckfragen/Empfehlungsbegruendung fachlich
bewerten und Vorlage ausdruecklich in der Vorschau waehlen. DE/EN-UI-Paritaet,
vollstaendige Quellen-/Modell-/Sicherheits-/Lifecyclequalifikation und
Application-Template-Beratung bleiben offen. #94 bleibt offen.

### Template-Beratung: erfundene Referenzen korrigiert (2026-10-10)

Benutzer meldete Sammelfehler nach Senden einer Enterprise-/Hub-&-Spoke-/
Firewall-Anfrage. GET in angemeldeter Sitzung war 200; Gespraech angelegt,
aber keine Modellantwort gespeichert. Direkte Reproduktion zeigte
`unknown_reference`: Qwen erfand Regelreferenzen, die korrekt abgelehnt wurden.

Korrektur: zusaetzliche modellseitige `response_format: json_schema` mit
striktem, aus Zod erzeugtem Vertrag und Enums fuer bekannte Template-/Regel-IDs;
die unabhaengige serverseitige Validierung bleibt erhalten. STACKIT-Endpunkt
akzeptiert dieses Schema. Sichere interne Fehlergruende ohne Prompt, Token,
Rohantwort oder Benutzerkennung; UI unterscheidet fehlgeschlagene Inferenz,
abgelaufene Anmeldung und fehlende Rechte. Fehlgeschlagene Anfrage bleibt
fuer ausdrueckliches erneutes Senden im Eingabefeld erhalten.

Nachweise: konkrete direkte Modellanfrage nun 4471 ms,
`hub-and-spoke-firewall`, vier Rueckfragen; elf fokussierte Tests und
kanonischer Check mit 448 Unit-Passes/53 Skips; vier Desktop-/Mobilfaelle
inklusive Fehleranzeige/Retry bestanden. Freigegebener lokaler API-Neustart;
in geteilter Browser-Sitzung dieselbe Benutzeranfrage ueber regulaeres Formular
erfolgreich mit HTTP 200, sichtbarer Empfehlung und vier Rueckfragen gespeichert.
Connector-Klick in unsichtbarer Seite scheiterte, regulaerer Formular-Submit
funktionierte ohne Auth-/CSRF-Umgehung. Keine Konfiguration ausgewaehlt,
erstellt oder geaendert. Fachliche Vollqualifikation bleibt offen; insbesondere
beweist eine Empfehlung nicht, dass saemtliche Kommunikationswege tatsaechlich
ueber die zentrale Firewall laufen.

## Technisch nachgewiesen

| Pruefung | Ergebnis | Grenze des Nachweises |
|---|---|---|
| Ubuntu-Docker und uebernommener PostgreSQL-Container | Bestanden | Loopback, erforderliches Containerlabel vorhanden |
| App-Check mit Node 24.21.0/npm 11.19.0 | Bestanden | Finaler Recovery-/Small-Arbeitsstand: Lint, Typen, Build; 436 Unit-Tests bestanden, 53 umgebungsgebundene Tests uebersprungen |
| OpenTofu 1.12.6 aus dem uebernommenen Linux-Paket | Bestanden | Version linux_amd64; keine Umbindung historischer Plans |
| Native Application-/Netzwerk-Vertraege | Bestanden | Backendfreies Init/Validate; 16 Application- und 7 Netzwerk-Mock-Tests |
| Lokaler API-/UI-Start gegen uebernommene Datenbank | Bestanden | Migrationen und Schluesselladen ohne Startfehler; lokale DB-Rollenpasswoerter durch dokumentierten Starter erneuert |
| HTTP-Smoke | Bestanden | UI 200, Health ok, anonyme Konfigurations-API 401; kein vollstaendiger Login |
| Echte PostgreSQL-Suite auf Ubuntu | Bestanden | 31 Tests in eigenem Testcontainer; Recovery-Diagnose, Secret-Schutz, abgelaufene Session und archivierte Bestellung enthalten |
| Linux-Paket ueber echten Worker | Bestanden | Passender Source-Pin aus Paket-Metadaten; Init/Validate mit Mirror, Abbruch vor Plan, keine Credentials |
| Native Governance-Vertraege | Bestanden | 3 Mock-Tests mit gepinntem OpenTofu; kein Backend/Apply |
| Recovery-Diagnose und Review HTTP-Gates | Bestanden | Tenant, CSRF, Origin, UUID, strikter Snapshot und no-store; 29 fokussierte HTTP-Tests |
| Recovery-Pruefbeleg mit Migration 051 | Bestanden | Frisch migrierte isolierte Testdatenbank; Autorisierung/Widerruf, Replay, unveraenderliche Belege und weiterhin gesperrte Ausfuehrung; 31 PostgreSQL-Tests |
| Lesender Recovery-Abgleich mit Migration 052 | Bestanden | 31 PostgreSQL-Tests; Start-/Abschluss-Faults, Recovery-State, Ticket-Ablauf, konsumierter Grant-Widerruf gesperrt, Delegationswiderruf transaktional geprueft; kein Secret oder State entschluesselt |
| Recovery-Abgleich Vertrag und Desktop/Mobil | Bestanden | 30 fokussierte Vertrags-/HTTP-Tests und 8 Browserfaelle; DE/EN, fehlende Live-Nachweise, keine implizite Freigabe und kein Plan/Apply/Destroy; Screenshots geprueft |
| Recovery-Diagnose Desktop/Mobil | Bestanden | DE/EN, Report-Hashes, Refresh-Fehler und keine schreibenden Requests; Screenshots geprueft |
| Vollstaendige Browsersuite auf finalem Abgleichs-/Small-Build | Bestanden | 278 Desktop-/Mobilfaelle; aktueller Public-Katalog, Start-/Abschlussunsicherheit, Recovery-DE/EN und Drift-Regressionsfall eingeschlossen; kontrollierte Fixtures, keine echte Cloud-Abnahme |
| Small-Issues #84/#82/#59 nativ | Bestanden | 14 backendfreie Root-/Governance-Mock-Tests; reale Standalone-Eingabe, unveraenderter Corporate-Default, Provider-Schema und Folder-Negativ-/Kompatibilitaetsfaelle; keine Cloud/State-Aenderung |
| Aktuelle Kataloge und generierte Small-Dokumentation | Bestanden | Go 1.27.1/Node 24.21.0 HCL-Rundlauf und drei Frischechecks; terraform-docs 0.24.0 fuer Root/Governance; historische Revisionen nicht regeneriert |
| Application-Bestellretries ueber neuen Service/Pool | Bestanden | Acht parallele Wiederholungen, genau eine Instanz und unveraenderte Bindungen; 31 echte PostgreSQL-Faelle mit --testTimeout=30000; keine Quoten- oder Cloud-Projekt-Abnahme |
| Echter Ubuntu-STACKIT-Login | Bestanden | Benutzer bestaetigt Erfolg beim zweiten Versuch; aktive Browser-Sitzung und beide uebernommenen Arbeitsbereiche sichtbar. Organisationszuordnung noch nicht verifiziert |

## Selbststaendig weiter pruefen und umsetzen

- [x] Small-Issues #84/#82/#59 als gemeinsames Paket mit nativen Vertraegen,
  aktuellen Katalogen, Altimport-Regressionsschutz, generierter Dokumentation
  und vollstaendigen App-/Desktop-/Mobil-Gates lokal qualifiziert.
- [x] Isolierte PostgreSQL-Suite auf Ubuntu mit eigener Testdatenbank.
- [x] Desktop-/Mobil-Browsersuite auf Ubuntu ohne Kunden-API.
- [x] Native Governance-Vertraege und passender Platform-Paket-Init-/Validate-Pfad.
- [x] Lesende Application-Recovery-Diagnose mit unveraenderten historischen
  Bindungen und angenommenen Nachweisen, ohne rohe State-/Credential-Inhalte.
- [x] Expliziter immutable Operator-Pruefbeleg fuer einen konkreten Diagnose-Stand;
  aktuelle urspruengliche PE-Freigabe, menschliche Identitaet, Hash-Bindung,
  Widerruf, idempotenter Replay und unveraenderte Ausfuehrungssperren isoliert geprueft.
- [x] Lesender Operator-Abgleich von gespeicherten Laufphasen, Runner-ID,
  Reports und Ticket-/Widerrufsmetadaten; unbekannte Live-Nachweise bleiben offen.
- [ ] Frische lesende Runner-, Credential-, State-Lock- und Cloud-Nachweise
  ueber getrennte Adapter qualifizieren; keine Freigabe aus Metadaten ableiten.
- [ ] Kontrollierter Rollout der Migrationen 051/052 und Review-Opt-in in die lokale
  Benutzer-API; diese laeuft weiterhin unveraendert mit Migrationen 001-050.
- [ ] Drei im angemeldeten Browser beobachtete HTTP-404-Meldungen den konkreten
  Requests zuordnen und bewerten; Login erfolgreich, Ursache noch nicht bestimmt.
  Spaetere lesende Ressourcen-Metadaten liefern keine zuordenbaren Fehler;
  die Browser-Sitzung zeigt inzwischen wieder Guest. Kein Ursachenbeleg.
- [ ] Application-Recovery-/Abgleichspfad: unklaren Start, Runner-Verlust,
  fehlende Abschlussmeldung und Teilfehler unterscheidbar machen; Nachweise
  unveraenderlich sichern und separate bestaetigte Operator-Aktion vorsehen.
- [ ] Expliziten Application-Upgrade-Pfad und Quoten gegen den MVP-Vertrag pruefen.
- [ ] Begrenzten Model-Serving-Assistenten gegen den MVP-Vertrag pruefen.

## Recovery-Diagnose: Erster Umsetzungsschritt

`GET /api/v1/applications/jobs/:id/recovery-diagnosis` verlangt eine aktuelle
Session, den aktuellen Tenant, den Besteller und eine aktive Bestellung. Die UI
bietet die lesende Aktion bei unklaren Laeufen oder fehlgeschlagenen Applies an.
Andere Benutzer erhalten dadurch keinen neuen Operator-Zugriff.

Die Diagnose liefert gespeicherte Job-/Plan-/Paket-/Source-/State-Bindungen und
Hash/Zeit/Paket der angenommenen Artefakt-, Output- und Recovery-Reports.
Sie liest keine lokalen Dateien oder Cloud-Ressourcen und entschluesselt keinen
State. Ein Recovery-Report verlangt State-Pruefung; ein unklarer Abschluss oder
fehlgeschlagener Apply verlangt Operator-Abgleich. Gespeicherte Laufstatus sind
kein Lebendigkeitsnachweis. Kein Retry, Unlock, State-Push, Cleanup, Erfolgseintrag
oder neue Freigabe entsteht aus einem GET.

Der separate Operator-Pruefbeleg ist als begrenzter neuer Schritt umgesetzt.
Vor einer echten Wiederherstellung muessen weiterhin aktuelle Berechtigung,
Runner-Stillstand, Ticket-/Widerrufsstatus, State-Lock und konkrete
State-/Cloud-Nachweise geprueft werden.
Ein fehlender Report darf nicht in Erfolg umgeschrieben werden. Historische
Reports, Plans und Paketbindungen bleiben erhalten. State-Wiederherstellung
bleibt von einer reinen Pruefbestaetigung getrennt und verlangt eigene Freigabe.

Die Diagnose-Erweiterung ist lokal implementiert und qualifiziert, nicht committed
oder im Release aus Run 37929894997 enthalten. Dessen Qualifikation gilt weiterhin
nur fuer seine unveraenderten Bytes. Eine Auslieferung neuer lokaler Erweiterungen
braucht einen neuen qualifizierten Build und separate Release-Freigabe.

## Recovery-Pruefprotokoll: Zweiter Umsetzungsschritt

Die neue Migration `051_application_recovery_reviews.sql` ist nur in der eigenen
synthetischen PostgreSQL-Testdatenbank angewandt. Migrationen 001-050 und die
laufende Benutzer-Datenbank bleiben unveraendert. Der Opt-in
`LZC_APPLICATION_RECOVERY_REVIEWS_ENABLED=true` aktiviert den Service unabhaengig
von nativer Plan-/Apply-Ausfuehrung. Ohne Opt-in bleiben die Endpunkte geschlossen;
die UI bietet die Aktion nur bei entsprechender Server-Capability an.

`GET /api/v1/applications/jobs/:id/recovery-review` liefert dem urspruenglich
freigebenden Platform Engineer den konkreten Pruefstand und einen bestehenden
Beleg. `POST` verlangt dieselbe Instanz, `confirmReview=true`, den exakten
Bindungs-Hash und den aktuellen Recovery-Hash oder ausdruecklich `null`.
Tenant, Session, aktuelle PE-Rolle und gueltige nicht widerrufene menschliche
STACKIT-Identitaet werden erneut geprueft. Rollen-/Session-/Human-Widerruf wird
mit der Prueftransaktion serialisiert. Ein geaenderter Stand wird als Konflikt
abgewiesen. Identische bestaetigte Wiederholung ist idempotent, aber umgeht keine
aktuellen Autorisierungspruefungen.

Der Beleg speichert Reviewer, Zeitpunkt, Session-ID und gebundene Hashes, keine
freien Notizen, Secrets oder rohen State. Runtime-Schreiben ist nur ueber die
geschuetzte SQL-Funktion moeglich; Update/Delete werden verweigert. Session-IDs
sind historische UUIDs ohne Fremdschluessel auf kurzlebige Login-Sessions.

Die Feststellung bleibt `state-review-required` oder `completion-review-required`.
Sie ist weder Runner-Stillstandsnachweis noch Cloud-Erfolg oder Recovery-Abschluss.
Jobstatus, gespeicherte Reports und State bleiben gleich; auch ein bestaetigter
Pruefbeleg gibt keinen Plan, Apply, Unlock, Retry oder Cleanup frei.
Desktop/Mobil pruefen explizite Bestaetigung, Konflikt/erneutes Laden, bestehende
Belege und DE/EN. Der neue Teilumfang ist noch nicht in der laufenden API aktiviert.

## Recovery-Abgleich: Dritter Umsetzungsschritt

Migration `052_application_recovery_reconciliation.sql` ergaenzt eine lesende
Security-Definer-Funktion hinter denselben aktuellen Session-/Tenant-/PE-/Human-
Guards wie der Pruefbeleg. Der bestehende GET-Pruefkontext liefert jetzt einen
beobachteten Metadatenstand mit Laufphase, Runner-ID, angenommenen Report-Hashes,
Ticket-Ablauf/erster Verwendung, Grant-Ablauf/-Widerruf und Delegationswiderruf.
Der aktuelle Service setzt 051 und 052 voraus; historische Migrationen bleiben
unveraendert. Die laufende Benutzer-API/-Datenbank bleibt auf 050 ohne Review-Opt-in.

Start ohne gespeicherte Runner-ID, fehlender Abschluss, gespeicherter Fehler und
Recovery-State werden separat eingeordnet. Gespeicherte Phasen sind keine
Lebendigkeitspruefung. Angenommene Reports werden nur als Hash/Zeit/Paket angezeigt.
Ticket-/Grant-Fenster sind keine vollstaendige technische Zugangspruefung.
Der bestehende Schutz konsumierter Grants bleibt bestehen: ihr nachtraeglicher
Widerruf scheitert. Delegationswiderruf und Ticket-Ablauf beweisen keinen Widerruf
bereits ausgegebener Cloud-Credentials oder einen gestoppten Runner.

Runner-Stillstand, Credential-Widerruf, State-Lock und Cloud-Abgleich bleiben
ausdruecklich `unknown`, Ausfuehrungsfreigabe bleibt `false`. Der strikte Vertrag
weist gegenteilige behauptete Live-Nachweise und Secret-Felder zurueck.
Ein alter Pruefbeleg bleibt erhalten, ist aber kein Beleg fuer diese offenen
Live-Pruefungen. Keine neue Mutation, kein Retry, Unlock, State-Push oder Cleanup
kommt hinzu. Separat autorisierte lesende Adapter und frische gebundene Nachweise
sind vor einer echten Wiederherstellungsentscheidung weiterhin erforderlich.

## Benutzerabnahme und externe Voraussetzungen

| Offen | Benoetigter Eingriff | Abnahmekriterium |
|---|---|---|
| Organisationsnachweis nach Ubuntu-Login | Bei erforderlichem menschlichem STACKIT-Nachweis mitwirken | Anmeldung gelungen und Arbeitsbereiche sichtbar; Organisationszuordnung separat verifizieren, Login allein genuegt nicht |
| Zwei-Organisations-Isolation | Benutzer stellt berechtigte Testidentitaeten und zwei Organisationen bereit | Kein fremder Zugriff auf Entwuerfe, Bestellungen, Credentials, Plans oder Ausgaben; lokale Fixtures allein genuegen nicht |
| Application-Cloud-Lifecycle | Benutzer prueft Konfiguration und gibt jeden konkreten Cloud-Vorgang separat frei | Eigener Instanz-State/Lock, Plananzeige, exakter gespeicherter Apply-Plan und ehrlicher Abschlussnachweis; bestehende Folder bleiben erhalten |
| Recovery-Live-Abnahme | Kontrollierten Testfall und konkrete Operator-Aktion gemeinsam freigeben | Keine doppelte Ausfuehrung, kein erfundener Erfolg; Zustand und Belege nach hartem Runner-Verlust nachvollziehbar |
| Least-Privilege und Live-Widerruf | Geeignete STACKIT-Rollen/Identitaeten bereitstellen | Technischer Zugang und Job-Grant bleiben bei Entzug, Rotation und Ablauf gesperrt |
| Gehosteter Login | Bereits angeforderte oeffentliche PKCE-Web-Client-ID bereitstellen | Exakter suffixfreier Origin und beide registrierten HTTPS-Callbacks; kein CLI-/Device-/GitHub-Ersatz |
| Release-Promotion | Separate Freigabe des geschuetzten Workflows nach Client-Bereitstellung | Qualifiziertes unveraendertes Artefakt aus Run 37929894997 promoten, sofern nicht abgelaufen; sonst neue Qualifikation erforderlich |
| Model Serving | Fachlichen Vorschlag abnehmen und echten Dienstzugang bereitstellen | Bestaetigter validierter Diff; keine eigenstaendige Cloud-Aktion oder Secret-Offenlegung |
| Gesamt-MVP und Merge | Ausdrueckliche fachliche und technische Freigabe | Verbindlicher Umfang einschliesslich Recovery, Upgrades und Assistent abgenommen; offene Grenzen dokumentiert |

Aktuelle Qualifikation: [Runtime-Bericht](runtime-validation-report.md).
Transfer und lokale Startanleitung: [Ubuntu-Uebernahme](ubuntu-transfer-2026-10-09.md).