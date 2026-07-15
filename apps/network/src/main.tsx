import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MockConnector, type MockConnectorSeed } from "@real-life-stack/mock-connector"

import App from "./App"
import { dwebCampSeedItems } from "./data/network-seed"
import "./index.css"

const DWEB_CAMP_GROUP_ID = "dwebcamp"
const MY_NETWORK_GROUP_ID = "my-network"
const LOCAL_USER_ID = "network-local-user"

const networkSeed: MockConnectorSeed = {
  items: dwebCampSeedItems,
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
    [DWEB_CAMP_GROUP_ID]: dwebCampSeedItems.map(({ id }) => id),
    [MY_NETWORK_GROUP_ID]: [],
  },
}

async function bootstrap() {
  const connector = new MockConnector(networkSeed)
  await connector.init()
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
