# RLS Vocabularies (Schemas)

This directory holds the **formal definitions** of the RLS standard vocabularies introduced in [`docs/spec/06-schema-composition-and-tags.md`](../docs/spec/06-schema-composition-and-tags.md).

Each vocabulary is identified by a stable URL of the form:

```
https://real-life-stack.org/vocab/{name}/v{version}
```

The same URL is referenced by RLS items in their `@context` array. During Phase 1 of the registry roadmap, the canonical files are served from this repository (and later, from real-life-stack.org).

## Layout

```
schemas/
├── README.md
└── vocab/
    ├── base/v1/
    │   ├── context.jsonld           # JSON-LD vocabulary context
    │   ├── schema.json              # JSON-Schema for the vocab's properties
    │   └── examples/valid/*.json    # well-formed example items
    ├── place/v1/
    ├── event/v1/
    ├── task/v1/
    └── person/v1/
```

## Conventions

### JSON-LD context (`context.jsonld`)

- Declares the properties this vocabulary adds.
- Property values may include `@type` hints (`xsd:dateTime`, `xsd:string`, …) and `@id` URIs.
- The context is **additive**: it only describes the properties owned by this vocab. Common item fields (`id`, `createdAt`, …) live in `base/v1`.

### JSON-Schema (`schema.json`)

- `$schema`: `https://json-schema.org/draft/2020-12/schema`.
- `$id`: the canonical schema URL (`…/schema.json`).
- `type`: always `object`.
- `properties`: only the fields this vocab owns.
- `required`: only fields that are strictly required by this vocab. A vocab can add structural meaning without forcing every field to exist.
- `additionalProperties: true` — other vocabularies may add fields to the same item.
- `$defs`: re-used sub-schemas (geometry types, durations, …).

### Composition at runtime

An RLS item composes its vocabularies via its `@context` array:

```json
{
  "id": "uuid",
  "@context": [
    "https://real-life-stack.org/vocab/base/v1",
    "https://real-life-stack.org/vocab/event/v1",
    "https://real-life-stack.org/vocab/place/v1"
  ],
  "data": { "title": "…", "start": "…", "position": { … } }
}
```

A validator resolves every URL in `@context`, fetches the matching `schema.json`, and validates `data` against the **`allOf`** of all schemas. Each schema is itself permissive (`additionalProperties: true`), so the composition produces the strictest combined contract.

### Adding or evolving a vocabulary

- Backwards-compatible additions (new optional field) bump the **patch** at most, no new `v{n}` directory.
- Breaking changes (rename, removal, semantic shift) require a new `v{n+1}` directory. The previous version remains served.
- Each vocabulary directory should keep at least one `examples/valid/*.json` for tooling and tests.

## Current vocabularies

| Vocab | Path | Required | Used by |
|---|---|---|---|
| `base/v1` | `vocab/base/v1/` | `id`, `createdAt`, `createdBy` | every item |
| `place/v1` | `vocab/place/v1/` | `position` | Map |
| `event/v1` | `vocab/event/v1/` | `start` | Calendar |
| `task/v1` | `vocab/task/v1/` | `status` | Kanban |
| `person/v1` | `vocab/person/v1/` | `displayName` | Contacts / Profile |
