import { CalendarView as ToolkitCalendarView, useItems } from "@real-life-stack/toolkit"

export function CalendarViewWrapper() {
  // Calendar activates on data.start (event/v1). Cross-context items
  // (e.g. an event with a place) appear here too.
  const { data: events } = useItems({ hasField: ["start"] })

  return (
    <ToolkitCalendarView
      events={events}
      onEventClick={(event) => console.log("Event clicked:", event.id)}
    />
  )
}
