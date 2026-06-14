import type { Meta, StoryObj } from "@storybook/react-vite"
import { ProfilePanelContent } from "./profile-panel-content"

const meta: Meta<typeof ProfilePanelContent> = {
  title: "Module Components / ProfilePanelContent",
  component: ProfilePanelContent,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-[380px] rounded-xl border bg-card shadow-sm">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ProfilePanelContent>

const baseProfile = {
  did: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
  name: "Timo",
  bio: "Permakultur, Code und gute Gespräche.",
  avatar: "https://i.pravatar.cc/150?img=12",
}

export const ViewForeign: Story = {
  name: "Read-only (fremdes Profil)",
  render: () => (
    <ProfilePanelContent
      mode="view"
      profile={baseProfile}
      onClose={() => console.log("close")}
    />
  ),
}

export const ViewNoBio: Story = {
  name: "Read-only ohne Bio",
  render: () => (
    <ProfilePanelContent
      mode="view"
      profile={{ ...baseProfile, bio: undefined }}
      onClose={() => console.log("close")}
    />
  ),
}

export const EditOwn: Story = {
  name: "Edit (eigenes Profil)",
  render: () => (
    <ProfilePanelContent
      mode="edit"
      profile={baseProfile}
      contactCount={7}
      onSave={async (u) => console.log("save", u)}
      onClose={() => console.log("close")}
    />
  ),
}
