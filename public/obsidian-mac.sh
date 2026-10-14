#!/bin/bash
# Lernstudio – Uni-Vault für Obsidian auf dem Mac einrichten, mit automatischem Abgleich.
#
# Im Terminal (Programme → Dienstprogramme → Terminal) einfügen, Enter:
#   bash -c "$(curl -fsSL https://<dein-name>.github.io/lernstudio/obsidian-mac.sh)" setup <besitzer>/<repo>
#
# Was passiert:
#   1. Der Vault wird nach ~/Uni geholt (Ordner für Obsidian). Die Git-Daten liegen getrennt in
#      ~/.lernstudio-vault.git, damit im Obsidian-Ordner nur deine Notizen liegen.
#   2. Dein Zugangsschlüssel (derselbe wie im Lernstudio) kommt in den macOS-Schlüsselbund.
#   3. Ein Hintergrund-Job gleicht alle 2 Minuten ab: was du in Obsidian schreibst, geht zu GitHub
#      (und damit in den Lernstudio und zu Claude), was dort neu ist, kommt in Obsidian an.
#      Nie Force-Push; bei einem Konflikt bricht der Abgleich ab und schreibt ins Log.
# Nochmal ausführen ist ungefährlich: Ein vorhandener Vault wird nicht überschrieben.
set -euo pipefail

REPO="${1:-}"
FOLDER="${2:-$HOME/Uni}"
GITDIR="$HOME/.lernstudio-vault.git"
LABEL="local.uni-knowledge-sync"
SUPPORT="$HOME/Library/Application Support/Lernstudio"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[[ "$REPO" == */* ]] || fail "Bitte Besitzer/Repo angeben, z. B.: … setup v6fdb8msrw-dotcom/Uni-"
OWNER="${REPO%%/*}"
URL="https://${OWNER}@github.com/${REPO}.git"

# 1. Git (kommt mit den Entwicklerwerkzeugen von Apple)
if ! git --version >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1 || true
  fail "Git fehlt noch. macOS zeigt gleich „Entwicklerwerkzeuge installieren“ – bestätigen, warten (ein paar Minuten), dann diesen Befehl nochmal ausführen."
fi

# 2. Zugang prüfen, sonst Schlüssel abfragen, bei GitHub prüfen und im Schlüsselbund speichern
[ -n "$(git config credential.helper || true)" ] || git config --global credential.helper osxkeychain

# Fragt GitHub, was der Schlüssel darf: ok | falsch | kein-repo | nur-lesen | offline.
# Der Schlüssel geht per stdin an curl, damit er nicht in der Prozessliste steht.
token_check() {
  local code
  code=$(printf 'header = "Authorization: Bearer %s"\n' "$1" |
    curl -s -o /dev/null -w '%{http_code}' -K - "https://api.github.com/repos/$REPO") || code=000
  case "$code" in
    200) ;;
    401) echo falsch; return ;;
    403 | 404) echo kein-repo; return ;;
    *) echo offline; return ;;
  esac
  # Schreibrecht: git-receive-pack beantwortet GitHub nur mit Contents = Read and write
  code=$(printf 'user = "%s:%s"\n' "$OWNER" "$1" |
    curl -s -o /dev/null -w '%{http_code}' -K - "https://github.com/$REPO.git/info/refs?service=git-receive-pack") || code=000
  case "$code" in
    200) echo ok ;;
    401) echo falsch ;;
    403 | 404) echo nur-lesen ;;
    *) echo offline ;;
  esac
}

if ! GIT_TERMINAL_PROMPT=0 git ls-remote -q "$URL" HEAD >/dev/null 2>&1; then
  say "Zugangsschlüssel für $REPO"
  echo "Schlüssel von GitHub (beginnt mit github_pat_) hier einfügen: ⌘V, dann Enter. Man sieht dabei nichts, das ist Absicht."
  while :; do
    read -r -s -p "Schlüssel: " TOKEN </dev/tty
    echo
    TOKEN=$(printf %s "$TOKEN" | tr -d '[:space:]')
    [ -n "$TOKEN" ] || fail "Abgebrochen, kein Schlüssel eingegeben."
    case "$TOKEN" in
      github_pat_* | ghp_*) ;;
      *)
        echo "Das ist kein GitHub-Schlüssel (der beginnt mit github_pat_). Nochmal kopieren und einfügen, oder nur Enter zum Abbrechen."
        continue
        ;;
    esac
    case "$(token_check "$TOKEN")" in
      ok) break ;;
      falsch) echo "GitHub kennt diesen Schlüssel nicht (unvollständig kopiert, abgelaufen oder gelöscht). Neuen einfügen, oder nur Enter zum Abbrechen." ;;
      kein-repo) echo "Der Schlüssel gilt nicht für $REPO. Auf GitHub beim Schlüssel „Edit“ → Repository access → „Only select repositories“ → ${REPO#*/} auswählen → speichern. Dann denselben Schlüssel hier nochmal einfügen." ;;
      nur-lesen) echo "Der Schlüssel darf $REPO nur lesen. Auf GitHub beim Schlüssel „Edit“ → Permissions → Contents → „Read and write“ → speichern. Dann denselben Schlüssel hier nochmal einfügen." ;;
      *) fail "GitHub ist gerade nicht erreichbar. Internet prüfen und den Befehl nochmal starten." ;;
    esac
  done
  # Alten Eintrag zuerst löschen: ältere Schlüsselbund-Helfer von git überschreiben vorhandene Einträge nicht.
  printf 'protocol=https\nhost=github.com\nusername=%s\n\n' "$OWNER" | git credential reject
  printf 'protocol=https\nhost=github.com\nusername=%s\npassword=%s\n\n' "$OWNER" "$TOKEN" | git credential approve
  unset TOKEN
  GIT_TERMINAL_PROMPT=0 git ls-remote -q "$URL" HEAD >/dev/null 2>&1 ||
    fail "Der Schlüssel passt, aber git findet ihn nicht im Schlüsselbund. Bitte die Ausgabe von: git config --show-origin --get-all credential.helper an Claude schicken."
fi

# 3. Vault holen (oder vorhandenen weiterverwenden)
if [ -e "$FOLDER/.git" ]; then
  say "Vault ist schon da: $FOLDER – ich richte nur den Abgleich (neu) ein."
elif [ -d "$FOLDER" ] && [ -n "$(ls -A "$FOLDER" 2>/dev/null)" ]; then
  fail "$FOLDER gibt es schon und ist nicht leer. Ich überschreibe nichts. Anderen Ordner als zweites Argument angeben, z. B. … setup $REPO \"\$HOME/Uni-Vault\""
else
  [ -e "$GITDIR" ] && fail "$GITDIR gibt es schon (von einem früheren Versuch?). Bitte umbenennen oder löschen und nochmal starten."
  say "Hole den Vault nach $FOLDER …"
  mkdir -p "$FOLDER"
  git init -q --separate-git-dir "$GITDIR" "$FOLDER"
  git -C "$FOLDER" remote add origin "$URL"
  git -C "$FOLDER" fetch -q origin main
  git -C "$FOLDER" checkout -q -B main origin/main
  git -C "$FOLDER" branch -q -u origin/main main
fi
git -C "$FOLDER" config user.name "$(id -F 2>/dev/null || whoami) (Mac)"
git -C "$FOLDER" config user.email "${OWNER}@users.noreply.github.com"

# 3b. Obsidian-Erweiterungen fürs Dashboard (Dataview, Homepage, 3D Graph) und das Theme Minimal.
#     Die Einstellungen liegen schon im Vault, hier kommen nur die Programmdateien dazu (stehen nicht im Repo).
fetch_release() { # <repo> <zielordner> <datei>…
  local repo="$1" dir="$2" f
  shift 2
  mkdir -p "$dir"
  for f in "$@"; do
    curl -fsSL "https://github.com/$repo/releases/latest/download/$f" -o "$dir/$f.tmp" && mv "$dir/$f.tmp" "$dir/$f" ||
      { rm -f "$dir/$f.tmp"; return 1; }
  done
}
say "Hole die Obsidian-Erweiterungen …"
PLUG="$FOLDER/.obsidian/plugins"
fetch_release blacksmithgu/obsidian-dataview "$PLUG/dataview" main.js manifest.json styles.css &&
  fetch_release mirnovov/obsidian-homepage "$PLUG/homepage" main.js manifest.json styles.css &&
  fetch_release alexw00/obsidian-3d-graph "$PLUG/3d-graph" main.js manifest.json styles.css &&
  fetch_release kepano/obsidian-minimal "$FOLDER/.obsidian/themes/Minimal" theme.css manifest.json ||
  echo "Erweiterungen konnten nicht geladen werden (offline?). Später nochmal ausführen oder in Obsidian unter Community plugins installieren."

# 4. Abgleich alle 2 Minuten. Das Skript liegt außerhalb des Vaults, damit macOS es immer ausführen darf.
mkdir -p "$SUPPORT" "$HOME/Library/Logs"
cp "$FOLDER/tools/sync.sh" "$SUPPORT/sync.sh"
chmod +x "$SUPPORT/sync.sh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat >"$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SUPPORT/sync.sh</string></array>
  <key>EnvironmentVariables</key><dict><key>VAULT_PATH</key><string>$FOLDER</string></dict>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

say "Fertig ✓"
[ -d /Applications/Obsidian.app ] || echo "Obsidian fehlt noch: kostenlos auf https://obsidian.md laden und in „Programme“ ziehen."
cat <<TXT
• Obsidian öffnen → „Open folder as vault“ → $FOLDER
  Beim ersten Öffnen fragt Obsidian, ob du dem Vault vertraust → „Trust author and enable plugins“.
  Dann startet das Dashboard (wiki/dashboard/home) automatisch.
• Ab jetzt einfach schreiben: Obsidian speichert sofort, alle 2 Minuten geht alles zu GitHub,
  in den Lernstudio und zu Claude. Neues aus dem Lernstudio kommt genauso in Obsidian an.
• Screenshots: ⌘⇧4 (oder ⌘⇧5), dann in der Notiz ⌘V – das Bild landet in raw/assets.
• Foliensätze: PDF in die Notiz ziehen oder in der Seitenleiste in den Ordner slides des Fachs.
• Läuft der Abgleich? Log ansehen: open ~/Library/Logs/uni-knowledge-sync.log
TXT
