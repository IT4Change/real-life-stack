import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Item } from "@real-life-stack/data-interface"
import { CalendarView } from "./calendar-view"

const events: Item[] = [
  {
    id: "event-1",
    type: "event",
    createdAt: "2026-05-01T09:00:00.000Z",
    createdBy: "user-1",
    data: {
      title: "Yoga im Park",
      start: "2026-05-23T09:00:00.000+02:00",
      end: "2026-05-23T10:30:00.000+02:00",
      location: "Stadtpark Mitte",
      description: "Gemeinsam in den Tag starten. Matten bitte selbst mitbringen.",
    },
    tags: ["bewegung", "community"],
  },
  {
    id: "event-2",
    type: "event",
    createdAt: "2026-05-02T09:00:00.000Z",
    createdBy: "user-2",
    data: {
      title: "Buchclub Treffen",
      start: "2026-05-23T20:00:00.000+02:00",
      end: "2026-05-23T22:00:00.000+02:00",
      location: "Kiezbibliothek"
    }, tags: ["kultur"],
  },
  {
    id: "event-3",
    type: "event",
    createdAt: "2026-05-03T09:00:00.000Z",
    createdBy: "user-3",
    data: {
      title: "Lauftreff am Morgen",
      start: "2026-05-24T07:00:00.000+02:00",
      end: "2026-05-24T08:00:00.000+02:00",
      location: "Parkrunde"
    }, tags: ["bewegung"],
  },
  {
    id: "event-4",
    type: "event",
    createdAt: "2026-05-04T09:00:00.000Z",
    createdBy: "user-1",
    data: {
      title: "Community Meeting",
      start: "2026-05-25T19:00:00.000+02:00",
      end: "2026-05-25T21:00:00.000+02:00",
      location: "Gemeinschaftsraum"
    }, tags: ["planung", "space"],
  },
  {
    id: "event-5",
    type: "project",
    createdAt: "2026-05-05T09:00:00.000Z",
    createdBy: "user-2",
    data: {
      title: "Open-Air Kino",
      start: "2026-05-26T21:00:00.000+02:00",
      end: "2026-05-26T23:30:00.000+02:00",
      location: "Hinterhof"
    }, tags: ["projekt", "kultur"],
  },
  {
    id: "event-6",
    type: "event",
    createdAt: "2026-05-06T09:00:00.000Z",
    createdBy: "user-3",
    data: {
      title: "Spielnachmittag für Kinder",
      start: "2026-05-27T14:00:00.000+02:00",
      end: "2026-05-27T16:30:00.000+02:00",
      location: "Familienzentrum"
    }, tags: ["kinder"],
  },
  {
    id: "event-7",
    type: "offer",
    createdAt: "2026-05-07T09:00:00.000Z",
    createdBy: "user-4",
    data: {
      title: "Internationales Sprachcafé",
      start: "2026-05-27T18:00:00.000+02:00",
      end: "2026-05-27T20:00:00.000+02:00",
      location: "Café Kollektiv"
    }, tags: ["sprache", "begegnung"],
  },
  {
    id: "event-8",
    type: "event",
    createdAt: "2026-05-08T09:00:00.000Z",
    createdBy: "user-1",
    data: {
      title: "Nachbarschaftsfest",
      start: "2026-05-28T14:00:00.000+02:00",
      end: "2026-05-28T22:00:00.000+02:00",
      location: "Müllerstraße"
    }, tags: ["fest"],
  },
  {
    id: "event-9",
    type: "event",
    createdAt: "2026-05-09T09:00:00.000Z",
    createdBy: "user-2",
    data: {
      title: "Nachbarschaftsflohmarkt",
      start: "2026-05-29T10:00:00.000+02:00",
      end: "2026-05-29T14:00:00.000+02:00",
      location: "Marktplatz"
    }, tags: ["markt"],
  },
  {
    id: "event-10",
    type: "task",
    createdAt: "2026-05-10T09:00:00.000Z",
    createdBy: "user-1",
    data: {
      title: "Fahrradtour ans Wasser",
      start: "2026-05-29T09:00:00.000+02:00",
      end: "2026-05-29T15:00:00.000+02:00",
      location: "Treffpunkt Bahnhof"
    }, tags: ["ausflug"],
  },
  {
    id: "event-11",
    type: "event",
    createdAt: "2026-05-11T09:00:00.000Z",
    createdBy: "user-2",
    data: {
      title: "Coding Workshop für Anfänger",
      start: "2026-05-31T18:30:00.000+02:00",
      end: "2026-05-31T21:00:00.000+02:00",
      location: "CoWorking Space"
    }, tags: ["lernen", "technik"],
  },
]

function CalendarModuleOverview() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <CalendarView
        events={events}
        initialDate="2026-05-22T12:00:00.000+02:00"
        currentUserId="user-1"
        onCreateEvent={() => undefined}
      />
    </div>
  )
}

const meta: Meta<typeof CalendarModuleOverview> = {
  title: "RLS/Space Modules/Calendar/Overview",
  component: CalendarModuleOverview,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
}

export default meta
type Story = StoryObj<typeof CalendarModuleOverview>

export const Default: Story = {}
