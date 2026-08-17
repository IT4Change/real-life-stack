# Runtime-Konfiguration und Branding

**Status:** Normativer Entwurf v0.1

Diese Spec beschreibt, wie eine RLS-App zur **Laufzeit** erfährt, gegen welche Dienste sie arbeitet und unter welcher Identität sie auftritt — damit **ein** gebautes Artefakt viele Instanzen bedienen kann.

Code-Referenzen:

- `packages/toolkit/src/lib/runtime-config.ts`
- `apps/reference/src/main.tsx` — Laden vor dem ersten Render
- `deploy/app/` — Container, der die Konfiguration aus Umgebungsvariablen erzeugt

## Motivation

Vite kompiliert `import.meta.env.VITE_*` beim Bauen in das Bundle. Ein so gebautes Artefakt gehört genau **einer** Instanz: Andere Endpunkte oder ein anderer Name erfordern einen neuen Build.

Für Self-Hosting ist das die falsche Grenze. Eine Gemeinschaft, die eine eigene Instanz betreibt, soll ein fertiges Artefakt beziehen und es **konfigurieren**, nicht bauen. Bauen zu müssen bindet sie an den Herausgeber des Artefakts — genau die Abhängigkeit, die Self-Hosting auflösen soll.

Darum gilt: **Was sich pro Instanz unterscheidet, wird zur Laufzeit gelesen.**

## Build-Zeit oder Laufzeit

| Wert | Wann | Warum |
|---|---|---|
| Basispfad (`VITE_BASE_PATH`) | Build-Zeit | Steckt in jeder Asset-URL des Bundles; er ist Teil des Auslieferungs-Layouts, nicht der Instanz-Identität |
| Dienst-Endpunkte (Relay, Profile, Backend) | **Laufzeit** | unterscheiden sich pro Instanz und ändern sich über deren Lebensdauer |
| Voreingestellter Connector | **Laufzeit** | Betriebsentscheidung der Instanz |
| Name, Logo, Favicon, Farben | **Laufzeit** | die Identität der Instanz |

Regeln:

1. Ein Wert, der sich zwischen zwei Instanzen unterscheiden kann, DARF NICHT einkompiliert werden.
2. Ein Wert, der zur Laufzeit fehlt, MUSS auf einen dokumentierten Standard zurückfallen. Eine Instanz ohne Konfiguration MUSS startfähig bleiben.
3. Die Konfiguration DARF KEINE Geheimnisse tragen. Sie wird an jeden Browser ausgeliefert.

## Der Vertrag

```ts
interface RuntimeConfig {
  /** Dienste, gegen die diese Instanz arbeitet. */
  endpoints: {
    relayUrl?: string
    profilesUrl?: string
    supabaseUrl?: string
    supabaseAnonKey?: string
  }
  /** Voreingestellter Connector; die URL-Angabe `?connector=` sticht ihn. */
  defaultConnector?: string
  /** Identität der Instanz. */
  branding?: Branding
}

interface Branding {
  /** Anzeigename; setzt zugleich den Dokumenttitel. */
  appName?: string
  /** Pfade relativ zum Auslieferungsstamm. */
  logoUrl?: string
  faviconUrl?: string
  /** Farbtokens, je Schema. Werte sind CSS-Farben. */
  colors?: {
    light?: Record<string, string>
    dark?: Record<string, string>
  }
}
```

## Herkunft und Vorrang

Die Konfiguration wird **einmal vor dem ersten Render** geladen. Quellen, in dieser Reihenfolge:

1. `${BASE_URL}config.json` — die Instanz-Konfiguration, vom Betreiber bereitgestellt
2. `import.meta.env.VITE_*` — die einkompilierten Werte, sofern vorhanden
3. die in `runtime-config.ts` dokumentierten Standardwerte

Regeln:

1. Das Laden MUSS vor dem ersten Render abgeschlossen sein. Eine App, die zuerst mit Standardwerten rendert und dann umschaltet, zeigt fremdes Branding und baut Verbindungen zu falschen Diensten auf.
2. Fehlt `config.json` oder ist sie fehlerhaft, MUSS die App mit Stufe 2 und 3 starten und den Fehler in der Konsole benennen. Ein Konfigurationsfehler DARF NICHT zu einer weißen Seite führen.
3. Zusammengeführt wird **feldweise**: Ein in `config.json` gesetztes Feld sticht, ein fehlendes fällt durch. Ein leeres Objekt ändert nichts.
4. Die geladene Konfiguration ist für die Laufzeit der Seite **unveränderlich**.

## Branding

Branding ist **Daten, nicht Code**. Eine Instanz gestaltet über Tokens und Assets, nicht über eigene Komponenten.

1. `appName` setzt den Dokumenttitel und erscheint überall, wo die App sich benennt.
2. `colors` werden als CSS-Custom-Properties auf das Wurzelelement gelegt, getrennt nach Schema. Sie überschreiben die Token-Vorgaben des Toolkits; unbekannte Tokennamen werden ignoriert.
3. `logoUrl` und `faviconUrl` verweisen auf Dateien, die der Betreiber ausliefert. Fehlt eine, greift das Standard-Asset.
4. Branding wird von **App-Shell-Flächen** gelesen. Space Modules DÜRFEN NICHT auf Branding verzweigen — ein Modul sieht in jeder Instanz gleich aus, abgesehen von den Tokens, die ohnehin global wirken.
5. Freies CSS einer Instanz ist **nicht Teil dieses Vertrags**. Ein Betreiber kann eigene Regeln nachladen; sie stehen außerhalb der Kompatibilitätszusage und können mit jedem Update brechen.

## Landingpage

Die Landingpage einer Instanz ist **keine RLS-App**. Sie ist eine eigenständige Seite am Auslieferungsstamm, die App liegt darunter (z.B. `/` und `/app`). Sie teilt weder Build noch Router mit der App und unterliegt keiner Vorgabe dieser Spec außer der, die App nicht zu ersetzen.

## Nicht-Ziele

Diese Spec definiert nicht:

- wie eine Instanz betrieben wird (Container, Proxy, TLS) — siehe `deploy/app/README.md`,
- Mandantenfähigkeit innerhalb einer Instanz: eine Instanz hat **eine** Identität,
- Zugriffsschutz: die Konfiguration ist öffentlich,
- Theming pro Space — das ist eine Eigenschaft von Groups, nicht der Instanz.
