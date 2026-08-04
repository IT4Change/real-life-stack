import { afterAll } from "vitest"
import Fastify, { type FastifyInstance } from "fastify"
import mercurius from "mercurius"
import { describeDataInterfaceContract } from "@real-life-stack/data-interface/testing"
import { GraphQLConnector } from "@real-life-stack/graphql-connector"
import { schema } from "../src/schema/index.js"

/**
 * Runs the shared DataInterface contract suite against the REAL
 * GraphQLConnector talking to the REAL server schema — in-process via
 * fastify.inject, no sockets. This is the boundary where hasSchema and
 * @context silently vanished before (#201): every filter parameter and every
 * persisted field must survive input types, store, output selection.
 *
 * Live observe() needs the websocket runtime → covered as feature-flag off;
 * the subscription filter itself is proven in schema-context.contract.test.ts.
 */

const apps: FastifyInstance[] = []

afterAll(async () => {
  for (const app of apps) await app.close()
})

describeDataInterfaceContract("GraphQLConnector ↔ graphql-server", {
  features: { observeReflectsWrites: false },
  async makeConnector() {
    const app = Fastify()
    await app.register(mercurius, { schema, subscription: false })
    await app.ready()
    apps.push(app)

    const injectFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await app.inject({
        method: "POST",
        url: "/graphql",
        headers: { "content-type": "application/json", ...(init?.headers as Record<string, string> | undefined) },
        payload: init?.body as string,
      })
      return new Response(response.body, {
        status: response.statusCode,
        headers: { "content-type": response.headers["content-type"] as string },
      })
    }) as typeof fetch

    const connector = new GraphQLConnector("http://in-process/graphql", { fetch: injectFetch })
    const user = await connector.getCurrentUser()
    if (!user) throw new Error("graphql demo store should have a current user")
    return { connector, currentUserId: user.id, dispose: () => app.close() }
  },
})
