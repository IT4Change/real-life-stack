import { createRequire } from "node:module"
import { defineConfig } from "vitest/config"

// graphql ships a CJS/ESM dual package. Pothos (which builds the schema) is
// resolved as CJS by Node, while a bare `import "graphql"` in the tests picks
// the ESM copy — graphql-js then rejects the schema as "from another realm".
// Pin the tests to the same CJS instance Pothos uses.
const require = createRequire(import.meta.url)

export default defineConfig({
  resolve: {
    alias: {
      graphql: require.resolve("graphql"),
    },
  },
})
