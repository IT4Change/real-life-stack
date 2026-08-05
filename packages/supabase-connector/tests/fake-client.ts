/**
 * In-memory fake of the SupabaseClientLike subset, so the REAL connector
 * runs in unit tests without a Supabase instance.
 *
 * Scope honesty: this fake mimics just enough PostgREST filter semantics to
 * exercise the connector's wiring (binding, mapping, reactivity, relation
 * store). It is NOT the referee for filter semantics — that is the live
 * contract suite against a running instance.
 */
import type {
  AuthLike,
  AuthSessionLike,
  AuthUserLike,
  ChannelLike,
  FilterBuilderLike,
  RealtimePayloadLike,
  SupabaseClientLike,
  SupabaseResult,
  TableLike,
} from "../src/client-types.js"

type Row = Record<string, unknown>

let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${++idCounter}`

function jsonPath(row: Row, column: string): unknown {
  // Supports "col" and "col->a->b" (numeric segments index arrays).
  const [head, ...path] = column.split("->")
  let value: unknown = row[head!]
  for (const segment of path) {
    if (value == null || typeof value !== "object") return undefined
    const key = /^\d+$/.test(segment) ? Number(segment) : segment
    value = (value as Record<string | number, unknown>)[key as never]
  }
  return value
}

interface Condition {
  matches(row: Row): boolean
}

class FakeFilterBuilder implements FilterBuilderLike {
  private conditions: Condition[] = []
  private orderings: Array<{ column: string; ascending: boolean }> = []
  private window: { from: number; to: number } | null = null

  constructor(private readonly rows: () => Row[]) {}

  eq(column: string, value: unknown): this {
    this.conditions.push({ matches: (row) => jsonPath(row, column) === value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.conditions.push({ matches: (row) => values.includes(jsonPath(row, column)) })
    return this
  }

  contains(column: string, value: unknown): this {
    this.conditions.push({
      matches: (row) => {
        const cell = jsonPath(row, column)
        if (!Array.isArray(cell) || !Array.isArray(value)) return false
        return value.every((needle) =>
          cell.some((entry) => JSON.stringify(entry) === JSON.stringify(needle)))
      },
    })
    return this
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator !== "is" || value !== null) throw new Error(`fake: unsupported not(${operator})`)
    this.conditions.push({
      matches: (row) => {
        const cell = jsonPath(row, column)
        return cell !== undefined && cell !== null
      },
    })
    return this
  }

  gte(column: string, value: unknown): this {
    this.conditions.push({
      matches: (row) => {
        const cell = jsonPath(row, column)
        return typeof cell === "number" && typeof value === "number" && cell >= value
      },
    })
    return this
  }

  lte(column: string, value: unknown): this {
    this.conditions.push({
      matches: (row) => {
        const cell = jsonPath(row, column)
        return typeof cell === "number" && typeof value === "number" && cell <= value
      },
    })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderings.push({ column, ascending: options?.ascending !== false })
    return this
  }

  range(from: number, to: number): this {
    this.window = { from, to }
    return this
  }

  private resolve(): Row[] {
    let result = this.rows().filter((row) => this.conditions.every((c) => c.matches(row)))
    for (const { column, ascending } of [...this.orderings].reverse()) {
      result = [...result].sort((a, b) => {
        const av = String(jsonPath(a, column) ?? "")
        const bv = String(jsonPath(b, column) ?? "")
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    if (this.window) result = result.slice(this.window.from, this.window.to + 1)
    return result.map((row) => structuredClone(row))
  }

  then<TResult1 = SupabaseResult<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.resolve(), error: null }).then(onfulfilled, onrejected)
  }

  single(): PromiseLike<SupabaseResult<Row>> {
    const rows = this.resolve()
    return Promise.resolve(
      rows.length === 1
        ? { data: rows[0]!, error: null }
        : { data: null, error: { message: `single(): ${rows.length} rows` } },
    )
  }

  maybeSingle(): PromiseLike<SupabaseResult<Row | null>> {
    const rows = this.resolve()
    return Promise.resolve(
      rows.length <= 1
        ? { data: rows[0] ?? null, error: null }
        : { data: null, error: { message: `maybeSingle(): ${rows.length} rows` } },
    )
  }
}

class FakeTable implements TableLike {
  constructor(
    private readonly name: string,
    private readonly store: FakeSupabaseClient,
  ) {}

  private get rows(): Row[] {
    return this.store.tables.get(this.name)!
  }

  select(_columns?: string): FilterBuilderLike {
    return new FakeFilterBuilder(() => this.rows)
  }

  insert(row: Row): { select(): { single(): PromiseLike<SupabaseResult<Row>> } } {
    const insertAndCheck = (): SupabaseResult<Row> => {
      // Parity with the real schema: groups has a DB-side id default,
      // items does NOT (0001) — a null item id must fail like Postgres.
      const withDefaults: Row = {
        ...(this.name === "groups" || this.name === "profiles" ? { id: nextId(this.name) } : {}),
        created_at: new Date().toISOString(),
        ...row,
      }
      if (this.name === "items" && (withDefaults.id === undefined || withDefaults.id === null)) {
        return { data: null, error: { message: `null value in column "id" of relation "items" violates not-null constraint`, code: "23502" } }
      }
      // Primary-key / composite-key conflicts mirror Postgres 23505.
      const keyColumns = this.name === "group_members" ? ["group_id", "user_id"] : ["id"]
      const collides = this.rows.some((existing) =>
        keyColumns.every((column) => existing[column] === withDefaults[column]))
      if (collides) return { data: null, error: { message: "duplicate key", code: "23505" } }
      // RLS insert policy: created_by must match the session (items/groups),
      // unless this fake runs as service role (fixture path).
      if (!this.store.serviceRole && (this.name === "items" || this.name === "groups")) {
        const sessionId = this.store.auth.session?.user.id
        if (!sessionId || withDefaults.created_by !== sessionId) {
          return { data: null, error: { message: "new row violates row-level security policy" } }
        }
      }
      this.rows.push(withDefaults)
      this.store.emit(this.name, { eventType: "INSERT", new: structuredClone(withDefaults), old: null })
      return { data: structuredClone(withDefaults), error: null }
    }
    return { select: () => ({ single: () => Promise.resolve(insertAndCheck()) }) }
  }

  update(patch: Row): TableLike["update"] extends (p: Row) => infer R ? R : never {
    const rows = this.rows
    const store = this.store
    const name = this.name
    const makeResult = (conditions: Array<[string, unknown]>): SupabaseResult<Row[]> => {
      const matched = rows.filter((row) => conditions.every(([column, value]) => row[column] === value))
      for (const row of matched) {
        // Immutability trigger parity: identity fields never change.
        for (const key of ["id", "type", "created_by", "created_at"]) {
          if (key in patch && patch[key] !== row[key]) {
            return { data: null, error: { message: `${key} is immutable` } }
          }
        }
        Object.assign(row, patch)
        store.emit(name, { eventType: "UPDATE", new: structuredClone(row), old: structuredClone(row) })
      }
      return { data: matched.map((row) => structuredClone(row)), error: null }
    }
    const chain = (conditions: Array<[string, unknown]>) => ({
      eq: (column: string, value: unknown) => chain([...conditions, [column, value]]),
      select: () => ({
        single: () => {
          const result = makeResult(conditions)
          if (result.error) return Promise.resolve({ data: null, error: result.error })
          const data = result.data!
          return Promise.resolve(
            data.length === 1
              ? { data: data[0]!, error: null }
              : { data: null, error: { message: `single(): ${data.length} rows` } },
          )
        },
      }),
      then: <T1, T2>(
        onfulfilled?: ((value: SupabaseResult<unknown>) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ) => Promise.resolve(makeResult(conditions) as SupabaseResult<unknown>).then(onfulfilled, onrejected),
    })
    return chain([]) as never
  }

  delete(): { eq(column: string, value: unknown): PromiseLike<SupabaseResult<unknown>> } {
    const rows = this.rows
    const store = this.store
    const name = this.name
    const chain = (conditions: Array<[string, unknown]>) => ({
      eq: (column: string, value: unknown) => chain([...conditions, [column, value]]),
      then: <T1, T2>(
        onfulfilled?: ((value: SupabaseResult<unknown>) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ) => {
        const removed = rows.filter((row) => conditions.every(([column, v]) => row[column] === v))
        for (const row of removed) {
          rows.splice(rows.indexOf(row), 1)
          store.emit(name, { eventType: "DELETE", new: null, old: structuredClone(row) })
        }
        return Promise.resolve({ data: null, error: null } as SupabaseResult<unknown>).then(onfulfilled, onrejected)
      },
    })
    return chain([]) as never
  }
}

class FakeChannel implements ChannelLike {
  readonly handlers = new Map<string, Array<(payload: RealtimePayloadLike) => void>>()

  on(
    _type: "postgres_changes",
    filter: { event: "*"; schema: string; table: string },
    callback: (payload: RealtimePayloadLike) => void,
  ): this {
    const list = this.handlers.get(filter.table) ?? []
    list.push(callback)
    this.handlers.set(filter.table, list)
    return this
  }

  subscribe(): unknown {
    return this
  }
}

class FakeAuth implements AuthLike {
  session: AuthSessionLike | null = null
  private listeners: Array<(event: string, session: AuthSessionLike | null) => void> = []
  /** Registered email users for signInWithPassword. */
  readonly users = new Map<string, { password: string; user: AuthUserLike }>()

  constructor(private readonly store: FakeSupabaseClient) {}

  async getSession() {
    return { data: { session: this.session }, error: null }
  }

  onAuthStateChange(callback: (event: string, session: AuthSessionLike | null) => void) {
    this.listeners.push(callback)
    return { data: { subscription: { unsubscribe: () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback)
    } } } }
  }

  private establish(user: AuthUserLike): SupabaseResult<{ user: AuthUserLike | null }> {
    this.session = { user }
    // Signup trigger parity: ensure the profile row exists.
    const profiles = this.store.tables.get("profiles")!
    if (!profiles.some((row) => row.id === user.id)) {
      profiles.push({
        id: user.id,
        display_name: (user.user_metadata?.display_name as string | undefined)
          ?? (user.email ? user.email.split("@")[0] : null),
        avatar_url: null,
        created_at: new Date().toISOString(),
      })
    }
    for (const listener of this.listeners) listener("SIGNED_IN", this.session)
    return { data: { user }, error: null }
  }

  async signInAnonymously(): Promise<SupabaseResult<{ user: AuthUserLike | null }>> {
    return this.establish({ id: nextId("anon"), email: null })
  }

  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<SupabaseResult<{ user: AuthUserLike | null }>> {
    const entry = this.users.get(email)
    if (!entry || entry.password !== password) {
      return { data: null, error: { message: "Invalid login credentials" } }
    }
    return this.establish(entry.user)
  }

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }): Promise<SupabaseResult<{ user: AuthUserLike | null }>> {
    if (this.users.has(email)) return { data: null, error: { message: "User already registered" } }
    const user: AuthUserLike = { id: nextId("user"), email, user_metadata: options?.data }
    this.users.set(email, { password, user })
    return this.establish(user)
  }

  async signOut(): Promise<{ error: { message: string } | null }> {
    this.session = null
    for (const listener of this.listeners) listener("SIGNED_OUT", null)
    return { error: null }
  }
}

export class FakeSupabaseClient implements SupabaseClientLike {
  readonly tables = new Map<string, Row[]>([
    ["items", []],
    ["groups", []],
    ["group_members", []],
    ["profiles", []],
  ])
  readonly auth: FakeAuth
  readonly channels: FakeChannel[] = []
  /** Service-role parity: RLS checks off (the marked fixture path). */
  serviceRole = false

  constructor() {
    this.auth = new FakeAuth(this)
  }

  from(table: string): TableLike {
    if (!this.tables.has(table)) throw new Error(`fake: unknown table ${table}`)
    return new FakeTable(table, this)
  }

  channel(_name: string): ChannelLike {
    const channel = new FakeChannel()
    this.channels.push(channel)
    return channel
  }

  removeChannel(channel: ChannelLike): unknown {
    const index = this.channels.indexOf(channel as FakeChannel)
    if (index >= 0) this.channels.splice(index, 1)
    return undefined
  }

  emit(table: string, payload: RealtimePayloadLike): void {
    for (const channel of this.channels) {
      for (const handler of channel.handlers.get(table) ?? []) handler(payload)
    }
  }

  /** Second-client simulation: emit an external change into the channels. */
  externalInsert(table: string, row: Row): void {
    const withDefaults = { id: row.id ?? nextId(table), created_at: new Date().toISOString(), ...row }
    this.tables.get(table)!.push(withDefaults)
    this.emit(table, { eventType: "INSERT", new: structuredClone(withDefaults), old: null })
  }
}
