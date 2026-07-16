import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MockConnector, type MockConnectorSeed } from "@real-life-stack/mock-connector"

import App from "./App"
import { buildDwebCampSeedItems } from "./data/network-seed"
import { NETWORK_RELATION_STORE_OPTIONS } from "./data/network-relation-predicates"
import "./index.css"

const DWEB_CAMP_GROUP_ID = "dwebcamp"
const MY_NETWORK_GROUP_ID = "my-network"
const LOCAL_USER_ID = "did:example:network-local-user"

async function bootstrap() {
  const dwebCampSeedItems = await buildDwebCampSeedItems()
  const networkSeed: MockConnectorSeed = {
    items: [],
    groups: [
      {
        id: DWEB_CAMP_GROUP_ID,
        name: "DWebCamp",
        data: { scope: "group", primaryColor: "#c98500", modules: ["graph"] },
      },
      {
        id: MY_NETWORK_GROUP_ID,
        name: "Mein Netzwerk",
        data: { scope: "personal", primaryColor: "#2a78d6", modules: ["graph"] },
      },
    ],
    users: [{ id: LOCAL_USER_ID, displayName: "Mein Profil" }],
    groupMembers: {
      [DWEB_CAMP_GROUP_ID]: [LOCAL_USER_ID],
      [MY_NETWORK_GROUP_ID]: [LOCAL_USER_ID],
    },
    groupItems: {
      [DWEB_CAMP_GROUP_ID]: [],
      [MY_NETWORK_GROUP_ID]: [],
    },
  }
  const connector = new MockConnector(networkSeed, {
    symmetricRelationPredicates: NETWORK_RELATION_STORE_OPTIONS.symmetricPredicates,
  })
  await connector.init()
  connector.injectSeedItems(dwebCampSeedItems, DWEB_CAMP_GROUP_ID)
  connector.setCurrentGroup(networkSeed.groups[0]?.id ?? null)

  if (import.meta.hot) {
    import.meta.hot.dispose(() => void connector.dispose())
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App connector={connector} />
    </StrictMode>,
  )
}

void bootstrap()
