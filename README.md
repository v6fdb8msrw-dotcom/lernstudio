# Lernstudio

Die Web-App über deinem Uni-Vault: ein klares, helles Cockpit in Weiß, Silber und Beige für Studium und Klausuren. Aufgebaut wie Muscle Studio, aber für die Uni.

Der Lernstudio ist das „Uni Hub“ für einen Vault nach dem [uni-knowledge-template](https://github.com/NicolasGypkens/uni-knowledge-template):

- **Dein Vault** (privates GitHub-Repo, z. B. `Uni-`) ist die eine Wahrheit: Folien, Mitschriften und Bücher in `raw/`, daraus von Claude Code gebaute Concept-Notes, Fach-Seiten, Klausur-Hubs und Todos in `wiki/`, Regeln in `CLAUDE.md`. Obsidian liest dieselben Dateien.
- **Claude Code** macht die KI-Arbeit über dein normales Claude-Abo („Slides Statistik bereit zum Verarbeiten“, „Exam Mode für Statistik“ …). Es entstehen keine API-Kosten.
- **Der Lernstudio** zeigt alles schön an, auf iPhone und Mac, auch offline. Er lädt neues Material hoch und lässt dich Mitschriften mit Fotos schreiben.

React · TypeScript · Vite · IndexedDB · installierbare PWA. Komplett kostenlos: GitHub Pages, privates GitHub-Repo, Obsidian und Claude über deinen normalen Zugang.

---

## Was die App kann

| Bereich | Was du siehst und tust |
|---|---|
| **Übersicht** | Begrüßung, nächste Prüfung mit Countdown und Lernstand, Semester-Fortschritt, Fächer mit Status-Balken, „Heute lernen“ (Concepts, die noch auf eine Mitschrift warten), Todos und was Claude zuletzt verarbeitet hat (aus `log.md`). |
| **Fach** | Fach-Seite (MOC) und Zusammenfassung, alle Begriffe mit Status, Klausur-Hub (Übersicht, Lernplan, Status) und das ganze Material aus `raw/` nach Art sortiert. |
| **Begriffe** | Register aller Concept-Notes A–Z, filterbar nach Fach und Status (Entwurf, wartet auf Mitschrift, angereichert, prüfungsfertig). |
| **Concept-Ansicht** | Obsidian-Markdown mit `[[Wikilinks]]`, eingebetteten Bildern, Callouts, aufklappbaren Selbsttest-Fragen, „Verlinkt von“, Knopf „In Obsidian öffnen“ und „Mit Claude besprechen“ (erklären, abfragen, zusammenfassen …). |
| **Suche** | Volltext über alle Notes im Vault und die Namen deiner hochgeladenen Dateien. |
| **Hochladen** | Viele Dateien auf einmal oder ganze Ordner (am Mac). Sie landen in `raw/<Semester>/<Fach>/<slides|notes|books|papers|videos>/`, alles in einem Commit. Danach steht der passende Befehl für Claude Code zum Kopieren bereit. YouTube-Links werden als `.txt` abgelegt. |
| **Mitschrift** | Schreiben wie in Notion, mit Überschriften, Listen, Markierungen und Fotos. Screenshots mit ⌘V, Fotos und Foliensätze (PDF, PowerPoint, Keynote) per Knopf oder Drag & Drop. **Speichert automatisch** (nach kurzer Tipp-Pause, spätestens alle 45 s und beim Verlassen) als Markdown in `raw/…/notes/`; Fotos landen in `raw/assets/`, Foliensätze sofort in `raw/…/slides/` und stehen als `![[…]]` in der Mitschrift. Notizen mit Kästen, Tabellen oder Formeln (z. B. aus Notion) bearbeitest du in Obsidian, die App zeigt sie nur an. |
| **Todos** | Liest und schreibt `wiki/dashboard/todos.md`: abhaken und neue anlegen. Gelöscht wird nie etwas, und die Format-Kommentare für Claude bleiben stehen. |
| **Claude** | Claude Chat öffnet claude.ai mit deiner Frage (optional mit den Begriffen eines Fachs als Kontext). Claude Code: alle Befehle aus `commands.md` zum Ausfüllen, Kopieren und Öffnen. |

**Offline:** Alles, was einmal geladen wurde, bleibt auf dem Gerät. Uploads, Mitschriften und Todos, die du offline machst, wartet die App ab und schickt sie, sobald du wieder online bist.

**Was die App nicht anfasst:** `wiki/` schreibt nur Claude Code (Ausnahme: `todos.md`). Die App legt nur Rohmaterial in `raw/` ab.

---

## 1. Einmal einrichten

### Vault vorbereiten
1. Dein Vault-Repo (z. B. `Uni-`) muss **privat** sein: GitHub → Repo → *Settings* → ganz unten *Change visibility* → *Private*.
2. Vault einmal mit Claude Code einrichten: im Vault-Ordner Claude Code starten und sagen „Richte den Vault für mich ein“ (Fächer, Semester, Prüfungstermine).

### Zugangsschlüssel für die App
1. GitHub → [Fine-grained tokens → Generate new token](https://github.com/settings/personal-access-tokens/new)
2. Name „Lernstudio“, Ablaufdatum z. B. in einem Jahr
3. *Repository access*: „Only select repositories“ → nur dein Vault-Repo
4. *Permissions → Repository permissions → Contents*: **Read and write**, sonst nichts
5. Schlüssel kopieren und in der App unter **Einstellungen** einfügen (auf iPhone und Mac je einmal)

Der Schlüssel bleibt nur auf dem jeweiligen Gerät (IndexedDB) und kann nur dieses eine Repo lesen und schreiben. Geht ein Gerät verloren, löschst du ihn auf GitHub.

---

## 2. Veröffentlichen (GitHub Pages, kostenlos)

Die App braucht ein **eigenes, öffentliches** Repo, denn GitHub Pages ist im Gratis-Konto nur für öffentliche Repos verfügbar. Darin liegt nur Code. Deine Notizen holt die App zur Laufzeit aus dem privaten Vault.

**Mit GitHub Desktop (ganz entspannt):**
1. Den Ordner `lernstudio` (aus dem ZIP) irgendwo ablegen, z. B. `~/lernstudio`.
2. GitHub Desktop → *File → Add Local Repository* → Ordner wählen. Falls gefragt: *create a repository*.
3. *Publish repository* → Name `lernstudio`, Haken bei „Keep this code private“ **entfernen** → *Publish*.
4. Auf github.com: Repo `lernstudio` → *Settings → Pages → Build and deployment → Source: GitHub Actions*.
5. Der Workflow `.github/workflows/deploy.yml` testet, baut und veröffentlicht bei jedem Push. Nach 1–2 Minuten läuft die App unter
   **`https://<dein-github-name>.github.io/lernstudio/`**

### Als App installieren
- **iPhone:** Adresse in **Safari** öffnen → *Teilen* → *Zum Home-Bildschirm*. Startet danach im Vollbild wie eine normale App.
- **Mac (Safari):** *Ablage → Zum Dock hinzufügen*. **Chrome:** Installieren-Symbol rechts in der Adressleiste.

Updates kommen von selbst: Nach jedem Push lädt die installierte App die neue Version, sobald du nichts tippst.

### Obsidian am Mac als Hauptwerkzeug
Obsidian und der Lernstudio arbeiten auf denselben Dateien. Damit beides von selbst zusammenpasst, einmal im Terminal ausführen
(der Befehl steht mit deinen Daten auch in der App unter **Einstellungen**):

```bash
bash -c "$(curl -fsSL https://<dein-github-name>.github.io/lernstudio/obsidian-mac.sh)" setup <dein-github-name>/<vault-repo>
```

Das Skript (`public/obsidian-mac.sh`) holt den Vault nach `~/Uni` (Git-Daten getrennt in `~/.lernstudio-vault.git`), legt deinen
Zugangsschlüssel in den macOS-Schlüsselbund und richtet einen Hintergrund-Job ein, der alle 2 Minuten abgleicht: was du in
Obsidian schreibst, geht zu GitHub (Lernstudio, Claude); was dort neu ist, kommt in Obsidian an. Nie Force-Push, bei Konflikten
bricht der Abgleich ab (Log: `~/Library/Logs/uni-knowledge-sync.log`). Außerdem holt es die Obsidian-Erweiterungen fürs
Dashboard (Dataview, Homepage, 3D Graph) und das Theme Minimal aus deren GitHub-Releases; die Einstellungen dafür liegen schon
im Vault, die Programmdateien bleiben aus dem Repo heraus. In Obsidian dann „Open folder as vault“ → `~/Uni` →
„Trust author and enable plugins“.

Abschalten: `launchctl unload ~/Library/LaunchAgents/local.uni-knowledge-sync.plist`

---

## 3. Alltag

1. Folien nach der Vorlesung: **Hochladen** → Fach → *Folien* → Dateien.
2. Mitschrift: **Mitschrift** → Fach → schreiben, Fotos rein → *Speichern*.
3. Den angezeigten Befehl kopieren und in Claude Code einfügen (Mac: Claude Code im Vault-Ordner, unterwegs: claude.ai/code mit dem Vault-Repo).
4. Claude baut Concept-Notes und pusht. Der Lernstudio zeigt sie nach dem nächsten Abgleich (oben rechts, oder automatisch beim Öffnen).
5. Vor der Klausur: „Exam Mode für <Fach>“ in Claude Code → Klausur-Hub und Lernplan erscheinen im Fach unter *Klausur*.

---

## 4. Entwickeln (Mac)

Voraussetzung: Node.js 24 und npm.

```bash
cd ~/lernstudio
npm install
npm run dev        # http://127.0.0.1:5174
```

| Befehl | Zweck |
|---|---|
| `npm run build` | Typprüfung und Produktions-Build nach `dist/` |
| `npm run preview` | Build lokal ansehen unter http://127.0.0.1:4174 (mit Offline-Modus) |
| `npm test` | Tests: Vault-Auswertung, Dashboard-Konfiguration, Todos, Wikilinks, Callouts, Sicherheit |
| `npm run lint` | Code-Prüfung mit oxlint |
| `npm run icons` | App-Icons aus `public/logo.svg` neu erzeugen |

### Projektstruktur

```
src/
  vault/       GitHub-Client, Zwischenspeicher (IndexedDB), Vault-Auswertung (Fächer, Concepts, Klausuren,
               Todos, Log, Rohdateien), Obsidian-Markdown, Todo-Änderungen
  state/       Vault-Verbindung (useVault), Router, Toasts
  components/  Rahmen, UI-Bausteine, Markdown-Ansicht, Mitschrift-Editor
  pages/       Übersicht, Fach, Note/Datei, Begriffe, Suche, Hochladen, Mitschrift, Todos, Claude, Einstellungen
  lib/         Datum, Dateien, Editor-HTML, Suche, Claude-Links
  styles/      Designsystem (Weiß, Silber, Beige)
```

### Wie die App mit dem Vault spricht
- Lesen: Git-Baum des Branches, Markdown aus `wiki/` sowie `index.md`, `log.md`, `CLAUDE.md` und `commands.md`. Alles wird nach SHA im Zwischenspeicher gehalten, geladen wird nur, was sich geändert hat.
- Schreiben: Git-Data-API, alle Dateien eines Vorgangs in **einem** Commit. Hat Claude Code inzwischen gepusht, setzt die App auf den neuen Stand auf (kein Force-Push). Todo-Änderungen werden auf den neuesten Stand von `todos.md` angewendet, damit nichts überschrieben wird.
- Dateien über 95 MB lehnt GitHub ab. Die App warnt vorher.
