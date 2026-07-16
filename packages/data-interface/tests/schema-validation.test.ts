import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..", "..", "..")
const VOCAB_DIR = join(REPO_ROOT, "docs", "spec", "schemas", "vocab")
const DEMO_DATA_PATH = join(REPO_ROOT, "packages", "data-interface", "data", "items.json")
const REQUIRED_VOCAB_NAMES = [
  "base",
  "event",
  "person",
  "place",
  "task",
  "relation",
  "project",
  "resource",
] as const

interface VocabEntry {
  name: string
  schemaPath: string
  examplesDir: string
  vocabUrl: string
  schemaUrl: string
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** Discover every schema under docs/spec/schemas/vocab/<name>/v1/. */
function discoverVocabs(): VocabEntry[] {
  const entries: VocabEntry[] = []
  if (!isDirectory(VOCAB_DIR)) return entries
  const names = readdirSync(VOCAB_DIR).filter((n) => isDirectory(join(VOCAB_DIR, n)))
  for (const name of names) {
    const schemaPath = join(VOCAB_DIR, name, "v1", "schema.json")
    if (!isFile(schemaPath)) continue
    entries.push({
      name,
      schemaPath,
      examplesDir: join(VOCAB_DIR, name, "v1", "examples", "valid"),
      vocabUrl: `https://real-life-stack.org/vocab/${name}/v1`,
      schemaUrl: `https://real-life-stack.org/vocab/${name}/v1/schema.json`,
    })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

const VOCABS = discoverVocabs()

function listJsonFiles(directory: string): string[] {
  try {
    return readdirSync(directory).filter((file) => file.endsWith(".json"))
  } catch {
    return []
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readJsonObject(path: string): Record<string, unknown> {
  return asRecord(JSON.parse(readFileSync(path, "utf-8")))
}

function schemaPropertyTerms(schema: Record<string, unknown>): Set<string> {
  const properties = asRecord(schema.properties)
  const dataSchema = asRecord(properties.data)
  const dataProperties = asRecord(dataSchema.properties)
  return new Set([...Object.keys(properties), ...Object.keys(dataProperties)])
}

function contextTerms(contextDocument: Record<string, unknown>): Set<string> {
  return new Set(Object.keys(asRecord(contextDocument["@context"])))
}

function vocabUrlToSchemaUrl(vocabUrl: string): string {
  return `${vocabUrl}/schema.json`
}

function buildAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  for (const vocab of VOCABS) {
    ajv.addSchema(JSON.parse(readFileSync(vocab.schemaPath, "utf-8")))
  }
  return ajv
}

function formatErrors(errors: unknown): string {
  return JSON.stringify(errors, null, 2)
}

describe("Vocab discovery", () => {
  it("finds all required v0.1 standard vocabularies", () => {
    const names = VOCABS.map((v) => v.name)
    for (const required of REQUIRED_VOCAB_NAMES) {
      expect(names, `missing standard vocab: ${required}/v1`).toContain(required)
    }
  })

  for (const name of REQUIRED_VOCAB_NAMES) {
    it(`${name}/v1 has a schema, context, and at least one valid example`, () => {
      const versionDir = join(VOCAB_DIR, name, "v1")
      expect(isFile(join(versionDir, "schema.json")), `missing schema for ${name}/v1`).toBe(true)
      expect(isFile(join(versionDir, "context.jsonld")), `missing context for ${name}/v1`).toBe(true)
      expect(
        listJsonFiles(join(versionDir, "examples", "valid")).length,
        `missing valid example for ${name}/v1`,
      ).toBeGreaterThan(0)
    })
  }
})

describe("Vocabulary contexts preserve base/v1 property ownership", () => {
  for (const name of REQUIRED_VOCAB_NAMES.filter((candidate) => candidate !== "base")) {
    it(`${name}/v1 does not re-claim a base-owned property term`, () => {
      const baseVersionDir = join(VOCAB_DIR, "base", "v1")
      const baseProperties = schemaPropertyTerms(
        readJsonObject(join(baseVersionDir, "schema.json")),
      )
      const baseContext = contextTerms(
        readJsonObject(join(baseVersionDir, "context.jsonld")),
      )
      const baseOwnedContextProperties = new Set(
        [...baseProperties].filter((term) => baseContext.has(term)),
      )

      const candidateContext = contextTerms(
        readJsonObject(join(VOCAB_DIR, name, "v1", "context.jsonld")),
      )
      const reclaims = [...candidateContext]
        .filter((term) => baseOwnedContextProperties.has(term))
        .sort()

      expect(reclaims, `${name}/v1 re-claims base/v1 property terms`).toEqual([])
    })
  }
})

describe("Vocab schemas are valid JSON-Schema 2020-12", () => {
  const ajv = buildAjv()
  for (const vocab of VOCABS) {
    it(`${vocab.name}/v1 compiles and is registered by $id`, () => {
      const validate = ajv.getSchema(vocab.schemaUrl)
      expect(validate, `schema not registered at ${vocab.schemaUrl}`).toBeDefined()
    })
  }
})

describe("Valid example items satisfy every schema in their @context", () => {
  const ajv = buildAjv()
  for (const vocab of VOCABS) {
    const files = listJsonFiles(vocab.examplesDir)
    for (const file of files) {
      const item = JSON.parse(readFileSync(join(vocab.examplesDir, file), "utf-8")) as {
        "@context"?: string[]
      }
      const ctx = item["@context"]

      // Spec 06 invariants for any item under examples/valid:
      // - @context MUST be present and non-empty.
      // - @context[0] MUST be base/v1.
      // - The directory-owning vocab MUST appear somewhere in @context (a
      //   file at vocab/event/v1/examples/valid is event/v1 by location;
      //   if its @context omits event/v1 it is misfiled, not valid).
      // Without these checks, an empty `@context: []` would produce zero
      // validation iterations and silently pass.
      it(`${vocab.name}/examples/valid/${file}: declares a non-empty @context`, () => {
        expect(Array.isArray(ctx), `@context must be an array`).toBe(true)
        expect(ctx!.length, `@context must be non-empty`).toBeGreaterThan(0)
        expect(ctx![0], `@context[0] must be base/v1`).toBe(
          "https://real-life-stack.org/vocab/base/v1",
        )
        if (vocab.name !== "base") {
          expect(
            ctx,
            `example in ${vocab.name}/examples/valid must declare ${vocab.vocabUrl} in @context`,
          ).toContain(vocab.vocabUrl)
        }
      })

      // A valid example must satisfy every schema it declares in @context,
      // not just the vocab its directory lives in. Otherwise a composed
      // example (e.g. event/v1 + place/v1) could pass against the directory
      // vocab while silently violating the other declared vocabs.
      for (const vocabUrl of ctx ?? []) {
        it(`${vocab.name}/examples/valid/${file} validates against ${vocabUrl.split("/vocab/")[1]}`, () => {
          const schemaUri = vocabUrlToSchemaUrl(vocabUrl)
          const validate = ajv.getSchema(schemaUri)
          if (!validate) {
            throw new Error(
              `Schema not registered for @context entry ${vocabUrl}. ` +
                `Expected $id ${schemaUri}.`,
            )
          }
          const ok = validate(item)
          if (!ok) throw new Error(`Validation failed:\n${formatErrors(validate.errors)}`)
          expect(ok).toBe(true)
        })
      }
    }
  }
})

describe("Demo-data items conform to their declared @context vocabularies", () => {
  const ajv = buildAjv()
  const items = JSON.parse(readFileSync(DEMO_DATA_PATH, "utf-8")) as Array<{
    id: string
    "@context"?: string[]
    [k: string]: unknown
  }>

  it("loads a non-empty demo-data set", () => {
    expect(items.length).toBeGreaterThan(0)
  })

  for (const item of items) {
    const ctx = item["@context"] ?? []

    it(`${item.id}: has non-empty @context starting with base/v1`, () => {
      expect(ctx.length).toBeGreaterThan(0)
      expect(ctx[0]).toBe("https://real-life-stack.org/vocab/base/v1")
    })

    for (const vocabUrl of ctx) {
      it(`${item.id}: validates against ${vocabUrl.split("/vocab/")[1]}`, () => {
        const schemaUri = vocabUrlToSchemaUrl(vocabUrl)
        const validate = ajv.getSchema(schemaUri)
        if (!validate) {
          throw new Error(
            `Schema not registered for @context entry ${vocabUrl}. ` +
              `Expected $id ${schemaUri}.`,
          )
        }
        const ok = validate(item)
        if (!ok) {
          throw new Error(
            `Item ${item.id} does not conform to ${vocabUrl}:\n${formatErrors(validate.errors)}`,
          )
        }
        expect(ok).toBe(true)
      })
    }
  }
})
