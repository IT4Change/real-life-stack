/**
 * Structural subset of the supabase-js client the connector uses.
 *
 * The connector is written against THIS interface, not the concrete
 * `SupabaseClient` type: unit tests run the real connector against an
 * in-memory fake, while `createSupabaseConnector()` adapts a real client.
 * PostgREST/Realtime SEMANTICS are not re-implemented anywhere — they are
 * proven by the live contract suite against a running Supabase instance.
 */

export interface SupabaseResult<T> {
  data: T | null
  error: { message: string; code?: string } | null
}

/** PostgREST filter builder — thenable, resolves to rows. */
export interface FilterBuilderLike extends PromiseLike<SupabaseResult<Record<string, unknown>[]>> {
  eq(column: string, value: unknown): this
  in(column: string, values: unknown[]): this
  contains(column: string, value: unknown): this
  not(column: string, operator: string, value: unknown): this
  gte(column: string, value: unknown): this
  lte(column: string, value: unknown): this
  order(column: string, options?: { ascending?: boolean }): this
  range(from: number, to: number): this
  single(): PromiseLike<SupabaseResult<Record<string, unknown>>>
  maybeSingle(): PromiseLike<SupabaseResult<Record<string, unknown> | null>>
}

export interface TableLike {
  select(columns?: string): FilterBuilderLike
  insert(row: Record<string, unknown>): { select(): { single(): PromiseLike<SupabaseResult<Record<string, unknown>>> } }
  update(patch: Record<string, unknown>): {
    eq(column: string, value: unknown): {
      select(): { single(): PromiseLike<SupabaseResult<Record<string, unknown>>> }
    } & PromiseLike<SupabaseResult<unknown>>
  }
  delete(): { eq(column: string, value: unknown): PromiseLike<SupabaseResult<unknown>> }
}

export interface RealtimePayloadLike {
  eventType: "INSERT" | "UPDATE" | "DELETE"
  new: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

export interface ChannelLike {
  on(
    type: "postgres_changes",
    filter: { event: "*"; schema: string; table: string },
    callback: (payload: RealtimePayloadLike) => void,
  ): this
  subscribe(): unknown
}

export interface AuthUserLike {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

export interface AuthSessionLike {
  user: AuthUserLike
}

export interface AuthLike {
  getSession(): Promise<SupabaseResult<{ session: AuthSessionLike | null }> | { data: { session: AuthSessionLike | null }; error: null }>
  onAuthStateChange(
    callback: (event: string, session: AuthSessionLike | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } }
  signInAnonymously(): Promise<SupabaseResult<{ user: AuthUserLike | null }>>
  signInWithPassword(credentials: { email: string; password: string }): Promise<SupabaseResult<{ user: AuthUserLike | null }>>
  signUp(credentials: { email: string; password: string; options?: { data?: Record<string, unknown> } }): Promise<SupabaseResult<{ user: AuthUserLike | null }>>
  signOut(): Promise<{ error: { message: string } | null }>
}

export interface SupabaseClientLike {
  from(table: string): TableLike
  auth: AuthLike
  channel(name: string): ChannelLike
  removeChannel(channel: ChannelLike): unknown
}
