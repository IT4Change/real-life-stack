# Eine eigene RLS-Instanz betreiben

Landingpage auf `/`, App auf `/app`, alles aus **einem** Image. Endpunkte und
Identität kommen zur Laufzeit — es wird nichts neu gebaut, wenn sich Name,
Farben oder Relay ändern (siehe [Spec 11](../../docs/spec/11-runtime-config-und-branding.md)).

## Schnellstart

Es wird nichts gebaut — die App kommt als fertiges Image.

```bash
cp .env.example .env
$EDITOR .env                 # Domain und Name sind Pflicht
docker compose up -d
```

## Vorschau beim Gestalten

Zum Ausprobieren ohne Domain und ohne Traefik:

```bash
docker compose -f docker-compose.preview.yml up -d   # → http://localhost:8080
```

`landing/` und `branding/` sind gemountet — Datei speichern, Seite neu laden,
fertig. Kein Rebuild.

## Was euch gehört

```
deploy/app/
├── .env          Domain, Name, Relay
├── landing/      eure Landingpage — freies HTML, wird auf / ausgeliefert
└── branding/     logo.svg · favicon.svg · theme.json
```

Beide Verzeichnisse werden **read-only** in den Container gemountet. Änderungen
wirken beim nächsten Laden der Seite; nur `.env`-Änderungen brauchen ein
`docker compose up -d`, weil daraus die `config.json` entsteht.

## Farben

`branding/theme.json` setzt Design-Tokens, getrennt nach hell und dunkel:

```json
{
  "light": { "primary": "#2f6b3a", "primary-foreground": "#ffffff" },
  "dark":  { "primary": "#8fd19e", "primary-foreground": "#0b1f12" }
}
```

Die Werte landen als CSS-Custom-Properties auf dem Wurzelelement. Ein Name, den
das Toolkit nicht kennt, wird verworfen und in der Browser-Konsole gemeldet —
ein Tippfehler bleibt so nicht stumm wirkungslos. Erlaubt sind Farbangaben
inklusive `oklch()`, `rgb()` und `hsl()`.

Die Datei wird **getrennt** von der übrigen Konfiguration geladen: Ist sie
kaputt, fehlen nur die Farben, und Name, Relay und Connector stehen weiter.

## Volle Kontrolle über die Konfiguration

Wer mehr will, als `.env` hergibt, legt eine eigene
`branding/config.json` ab. Sie wird unverändert übernommen und sticht alle
Umgebungsvariablen:

```json
{
  "endpoints": { "relayUrl": "wss://relay.example.org" },
  "defaultConnector": "wot",
  "branding": {
    "appName": "Waldgarten",
    "colors": { "light": { "primary": "#2f6b3a" } }
  }
}
```

Diese Datei geht an jeden Browser. **Keine Geheimnisse hineinschreiben.**

## Grenzen

Die Landingpage darf beliebig sein — sie ist eine eigene Seite. Das App-Layout
ist es nicht: Dort gibt es Tokens, Logo und Name, aber keinen eigenen Code.
Alles darüber hinaus hieße, den Stack zu forken, und das nächste Update würde
die Instanz brechen.

## Relay

Solange es ein gemeinsames Relay gibt, ist es die Vorbelegung. Sobald Relays
föderiert sind, trägt eine Instanz hier ihr eigenes ein — dann kommt der Relay
als weiterer Dienst in diese `docker-compose.yml`, ohne dass sich am Rest
etwas ändert.

## Updates

Das Image trägt Tags: `1` folgt Korrekturen innerhalb der Major-Version, `1.4`
und `1.4.2` pinnen genauer. `RLS_IMAGE_TAG` in der `.env` bestimmt, welchem
eine Instanz folgt; voreingestellt ist `1`.

`edge` ist der Stand des Hauptzweigs und für uns zum Testen gedacht — eine
betriebene Instanz sollte nicht darauf zeigen.

## Für Entwickler: lokal bauen

Nur im Stack-Repo, wo der Quelltext liegt:

```bash
docker compose -f docker-compose.preview.yml -f docker-compose.build.yml up --build
```

Die Betriebs- und Vorschau-Dateien kennen bewusst keinen Build-Kontext. Eine
Instanz besteht aus Konfiguration und Assets; hätte sie einen Build-Kontext,
bräuchte jeder Betreiber das Monorepo — genau die Abhängigkeit, die
Self-Hosting auflösen soll.
