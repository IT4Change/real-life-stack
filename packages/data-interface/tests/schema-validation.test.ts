import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..", "..", "..")
const VOCAB_DIR = join(REPO_ROOT, "docs", "spec", "schemas", "vocab")
const DEMO_DATA_PATH = join(REPO_ROOT, "packages", "data-interface", "data", "items.json")

const VOCAB_NAMES = ["base", "event", "place", "task", "person"] as const

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(join(VOCAB_DIR, name, "v1", "schema.json"), "utf-8"))
}

function schemaUrl(name: string): string {
  return `https://real-life-stack.org/vocab/${name}/v1/schema.json`
}

function vocabUrlToSchemaUrl(vocabUrl: string): string {
  return `${vocabUrl}/schema.json`
}

function buildAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  for (const name of VOCAB_NAMES) {
    ajv.addSchema(loadSchema(name))
  }
  return ajv
}

function formatErrors(errors: unknown): string {
  return JSON.stringify(errors, null, 2)
}

describe("Vocab schemas are valid JSON-Schema 2020-12", () => {
  const ajv = buildAjv()
  for (const name of VOCAB_NAMES) {
    it(`${name}/v1 compiles`, () => {
      const validate = ajv.getSchema(schemaUrl(name))
      expect(validate, `schema not registered at ${schemaUrl(name)}`).toBeDefined()
    })
  }
})

describe("Valid example items satisfy their declared schemas", () => {
  const ajv = buildAjv()
  for (const name of VOCAB_NAMES) {
    const examplesDir = join(VOCAB_DIR, name, "v1", "examples", "valid")
    let files: string[]
    try {
      files = readdirSync(examplesDir).filter((f) => f.endsWith(".json"))
    } catch {
      files = []
    }
    for (const file of files) {
      const itemPath = join(examplesDir, file)
      const item = JSON.parse(readFileSync(itemPath, "utf-8"))

      it(`${name}/examples/valid/${file} validates against ${name}/v1`, () => {
        const validate = ajv.getSchema(schemaUrl(name))!
        const ok = validate(item)
        if (!ok) throw new Error(`Validation failed:\n${formatErrors(validate.errors)}`)
        expect(ok).toBe(true)
      })

      if (name !== "base") {
        it(`${name}/examples/valid/${file} also validates against base/v1`, () => {
          const validate = ajv.getSchema(schemaUrl("base"))!
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

  it("loads 32 items", () => {
    expect(items.length).toBe(32)
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
              `Expected $id ${schemaUri}.`
          )
        }
        const ok = validate(item)
        if (!ok) {
          throw new Error(
            `Item ${item.id} does not conform to ${vocabUrl}:\n${formatErrors(validate.errors)}`
          )
        }
        expect(ok).toBe(true)
      })
    }
  }
})
