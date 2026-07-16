import { deriveRelationRecordId } from "@real-life-stack/data-interface"
import { describe, expect, it } from "vitest"

import { DWEB_CAMP_SEED_CREATOR } from "./network-seed"
import {
  NETWORK_RELATION_PREDICATES,
  NETWORK_RELATION_STORE_OPTIONS,
} from "./network-relation-predicates"

describe("network relation predicate catalog", () => {
  it("declares the seven unique network predicates and only two symmetric ones", () => {
    const predicates = NETWORK_RELATION_PREDICATES.map(({ predicate }) => predicate)
    const symmetric = NETWORK_RELATION_PREDICATES
      .filter(({ symmetric }) => symmetric)
      .map(({ predicate }) => predicate)

    expect(predicates).toHaveLength(7)
    expect(new Set(predicates).size).toBe(7)
    expect(symmetric).toEqual(["knows", "connectedWith"])
    expect([...(NETWORK_RELATION_STORE_OPTIONS.symmetricPredicates ?? [])]).toEqual(symmetric)
  })

  it("preserves the connectedWith relation ID through derived options", async () => {
    await expect(deriveRelationRecordId(
      DWEB_CAMP_SEED_CREATOR,
      "connectedWith",
      "item:project-fsfe",
      "item:event-3kgbef",
      NETWORK_RELATION_STORE_OPTIONS,
    )).resolves.toBe(
      "rel-5b412a2b673962f16ff89324a7a9cb84b90d5c412d10203e66f62f6dcdb00bbc",
    )
  })
})
