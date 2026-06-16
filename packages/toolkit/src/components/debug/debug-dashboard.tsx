import { useState, useEffect, useCallback } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../primitives/tabs"
import { TraceTimeline, type TraceEntry } from "./trace-timeline"
import { StoreInspector, type DebugSnapshot } from "./store-inspector"

function getTraceEntries(): TraceEntry[] {
  if (typeof window === "undefined") return []
  const fn = (window as any).wotTrace
  return typeof fn === "function" ? fn() : []
}

function getDebugSnapshot(): DebugSnapshot | null {
  if (typeof window === "undefined") return null
  const fn = (window as any).wotDebug
  return typeof fn === "function" ? fn() : null
}

function getPerfSummary(): Record<string, { count: number; avgMs: number; p95Ms: number; maxMs: number }> {
  if (typeof window === "undefined") return {}
  const fn = (window as any).wotTracePerf
  return typeof fn === "function" ? fn() : {}
}

// Content-only — rendered into the app-level shared module panel (App.tsx
// opens it via modulePanel.open({ kind: "debug", ... })). No own AdaptivePanel.
export function DebugDashboard() {
  const [traces, setTraces] = useState<TraceEntry[]>([])
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null)
  const [perfSummary, setPerfSummary] = useState<Record<string, { count: number; avgMs: number; p95Ms: number; maxMs: number }>>({})

  const refresh = useCallback(() => {
    setTraces(getTraceEntries())
    setSnapshot(getDebugSnapshot())
    setPerfSummary(getPerfSummary())
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [refresh])

  const errors = traces.filter((t) => !t.success)
  const relayTraces = traces.filter((t) => t.store === "relay")

  return (
    <div className="@container">
        {/* Stats bar — pr-24 reserves space for AdaptivePanel's absolute top-3 right-3 buttons */}
        <div className="flex items-center gap-3 px-3 pr-24 py-3 border-b border-border text-[10px] text-muted-foreground sticky top-0 bg-background">
          <span className="font-semibold text-xs text-foreground">Debug</span>
          {errors.length > 0 && (
            <span>Errors: <span className="text-red-500 font-medium">{errors.length}</span></span>
          )}
          {snapshot?.sync.relay && (
            <span>
              Relay:{" "}
              <span className={snapshot.sync.relay.connected ? "text-green-500" : "text-red-500"}>
                {snapshot.sync.relay.connected ? "verbunden" : "getrennt"}
              </span>
            </span>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="trace" className="p-2">
          <TabsList className="w-full">
            <TabsTrigger value="trace" className="text-xs">Trace</TabsTrigger>
            <TabsTrigger value="stores" className="text-xs">Stores</TabsTrigger>
            <TabsTrigger value="relay" className="text-xs">Relay</TabsTrigger>
            <TabsTrigger value="perf" className="text-xs">Perf</TabsTrigger>
            <TabsTrigger value="errors" className="text-xs">
              Errors{errors.length > 0 && ` (${errors.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trace">
            <TraceTimeline entries={traces} onClear={() => {
              const fn = (window as any).wotTraceClear
              if (typeof fn === "function") fn()
              refresh()
            }} />
          </TabsContent>

          <TabsContent value="stores">
            <StoreInspector snapshot={snapshot} traces={traces} />
          </TabsContent>

          <TabsContent value="relay">
            <RelayPanel snapshot={snapshot} traces={relayTraces} />
          </TabsContent>

          <TabsContent value="perf">
            <PerformancePanel summary={perfSummary} />
          </TabsContent>

          <TabsContent value="errors">
            <ErrorPanel errors={errors} />
          </TabsContent>
        </Tabs>
      </div>
  )
}

// --- Relay Panel ---

function RelayPanel({
  snapshot,
  traces,
}: {
  snapshot: DebugSnapshot | null
  traces: TraceEntry[]
}) {
  const relay = snapshot?.sync.relay

  const sends = traces.filter((t) => t.operation === "send")
  const receives = traces.filter((t) => t.operation === "receive")
  const stateChanges = traces.filter((t) => t.operation === "connect" || t.operation === "disconnect")

  return (
    <div className="space-y-3 text-xs">
      {/* Connection status */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Status</span>
        <span className={relay?.connected ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
          {relay?.connected ? "Verbunden" : "Getrennt"}
        </span>
        {relay?.url && (
          <>
            <span className="text-muted-foreground">URL</span>
            <span className="truncate font-mono text-[10px]">{relay.url}</span>
          </>
        )}
        <span className="text-muted-foreground">Peers</span>
        <span>{relay?.peers ?? 0}</span>
        {relay?.lastMessage && (
          <>
            <span className="text-muted-foreground">Letzte Nachricht</span>
            <span>{new Date(relay.lastMessage).toLocaleTimeString("de-DE")}</span>
          </>
        )}
      </div>

      {/* Message stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Gesendet" value={sends.length} />
        <StatBox label="Empfangen" value={receives.length} />
        <StatBox label="State-Changes" value={stateChanges.length} />
      </div>

      {/* Reconnect history */}
      {stateChanges.length > 0 && (
        <div>
          <h4 className="font-medium mb-1">Verbindungs-History</h4>
          <div className="space-y-0.5">
            {stateChanges.slice(-10).map((t) => (
              <div key={t.id} className="flex justify-between text-[11px]">
                <span className={t.success ? "text-green-600" : "text-red-500"}>{t.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {new Date(t.timestamp).toLocaleTimeString("de-DE")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent messages */}
      <div>
        <h4 className="font-medium mb-1">Letzte Nachrichten</h4>
        <div className="space-y-0.5">
          {[...sends, ...receives]
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
            .slice(-20)
            .map((t) => (
              <div key={t.id} className="flex items-center gap-1 text-[11px]">
                <span className={t.operation === "send" ? "text-blue-500" : "text-green-500"}>
                  {t.operation === "send" ? "\u2191" : "\u2193"}
                </span>
                <span className="truncate flex-1">{t.label}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {new Date(t.timestamp).toLocaleTimeString("de-DE")}
                </span>
              </div>
            ))}
          {sends.length + receives.length === 0 && (
            <span className="text-muted-foreground">Keine Nachrichten</span>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Performance Panel ---

function PerformancePanel({
  summary,
}: {
  summary: Record<string, { count: number; avgMs: number; p95Ms: number; maxMs: number }>
}) {
  const entries = Object.entries(summary).sort((a, b) => b[1].maxMs - a[1].maxMs)

  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">Noch keine Performance-Daten</span>
  }

  return (
    <div className="text-xs">
      <table className="w-full">
        <thead>
          <tr className="text-muted-foreground text-[10px]">
            <th className="text-left font-medium pb-1">Store:Op</th>
            <th className="text-right font-medium pb-1">Count</th>
            <th className="text-right font-medium pb-1">Avg</th>
            <th className="text-right font-medium pb-1">P95</th>
            <th className="text-right font-medium pb-1">Max</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, stats]) => (
            <tr key={key} className="border-t border-border/50">
              <td className="py-0.5 font-mono text-[10px]">{key}</td>
              <td className="text-right tabular-nums">{stats.count}</td>
              <td className="text-right tabular-nums">{stats.avgMs}ms</td>
              <td className="text-right tabular-nums">{stats.p95Ms}ms</td>
              <td className={`text-right tabular-nums ${stats.maxMs > 100 ? "text-amber-500" : ""} ${stats.maxMs > 500 ? "text-red-500" : ""}`}>
                {stats.maxMs}ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Error Panel ---

function ErrorPanel({ errors }: { errors: TraceEntry[] }) {
  if (errors.length === 0) {
    return <span className="text-xs text-muted-foreground">Keine Fehler</span>
  }

  return (
    <div className="space-y-2 text-xs">
      {errors.slice(-20).reverse().map((e) => (
        <div key={e.id} className="border border-red-500/30 rounded p-2">
          <div className="flex justify-between items-start mb-1">
            <span className="font-medium text-red-500">
              {e.store}:{e.operation}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {new Date(e.timestamp).toLocaleTimeString("de-DE")}
            </span>
          </div>
          <div className="text-[11px] mb-1">{e.label}</div>
          {e.error && <div className="text-red-500 text-[10px] font-mono break-all">{e.error}</div>}
          {e.meta && Object.keys(e.meta).length > 0 && (
            <pre className="text-[9px] bg-muted rounded p-1 mt-1 overflow-x-auto">
              {JSON.stringify(e.meta, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

// --- Shared ---

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted rounded p-1.5 text-center">
      <div className="text-sm font-medium tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  )
}
