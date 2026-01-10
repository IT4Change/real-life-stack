import { useState } from "react"
import { Routes, Route } from "react-router-dom"
import {
  Newspaper,
  Map,
  Calendar,
  Users,
  MessageCircle,
  Plus,
  UserPlus,
  MapPin,
  Sun,
  Moon,
} from "lucide-react"

import {
  AppShell,
  AppShellMain,
  Navbar,
  NavbarStart,
  NavbarCenter,
  NavbarEnd,
  WorkspaceSwitcher,
  UserMenu,
  ModuleTabs,
  BottomNav,
  SimplePostWidget,
  PostCard,
  StatCard,
  ActionCard,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Avatar,
  AvatarFallback,
  type Workspace,
  type UserData,
  type Module,
  type Post,
} from "@real-life-stack/toolkit"

// Base path for assets (configured via Vite)
const basePath = import.meta.env.BASE_URL

// Demo data
const workspaces: Workspace[] = [
  { id: "1", name: "Dank", avatar: `${basePath}dank-logo.svg` },
  { id: "2", name: "Maluhia", avatar: `${basePath}maluhia-logo.png` },
  { id: "3", name: "Utopia", avatar: `${basePath}utopia-logo.svg` },
]

const user: UserData = {
  id: "1",
  name: "Max Mustermann",
  email: "max@example.com",
  avatar: "https://randomuser.me/api/portraits/men/32.jpg",
}

const modules: Module[] = [
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "map", label: "Karte", icon: Map },
  { id: "calendar", label: "Kalender", icon: Calendar },
]

const demoPosts: Post[] = [
  {
    id: "1",
    author: {
      name: "Anna Schmidt",
      avatar: "https://randomuser.me/api/portraits/women/44.jpg",
    },
    content:
      "Wer hat Lust auf einen gemeinsamen Spaziergang im Park am Samstag? Treffpunkt wäre 14 Uhr am Eingang. Hunde sind natürlich willkommen!",
    timestamp: "vor 2 Stunden",
    likes: 5,
    comments: 3,
    type: "text",
  },
  {
    id: "2",
    author: {
      name: "Dank Community",
      avatar: `${basePath}dank-logo.svg`,
    },
    content:
      "Nächstes Treffen: Dienstag 19 Uhr im Gemeinschaftshaus. Thema: Planung der Frühjahrs-Pflanzaktion. Alle sind herzlich eingeladen!",
    timestamp: "vor 5 Stunden",
    likes: 12,
    comments: 8,
    type: "event",
  },
  {
    id: "3",
    author: {
      name: "Thomas Müller",
      avatar: "https://randomuser.me/api/portraits/men/67.jpg",
    },
    content:
      "Suche jemanden der mir beim Umzug nächste Woche helfen kann. Biete Pizza und Getränke als Dankeschön!",
    timestamp: "gestern",
    likes: 3,
    comments: 7,
    type: "request",
  },
  {
    id: "4",
    author: {
      name: "Lisa Weber",
      avatar: "https://randomuser.me/api/portraits/women/28.jpg",
    },
    content:
      "Hat jemand Erfahrung mit Urban Gardening? Ich möchte meinen Balkon begrünen und suche Tipps für Anfänger.",
    timestamp: "gestern",
    likes: 8,
    comments: 12,
    type: "text",
  },
  {
    id: "5",
    author: {
      name: "Maluhia Hawaii",
      avatar: `${basePath}maluhia-logo.png`,
    },
    content:
      "Aloha! Wir organisieren einen Strand-Cleanup am Wochenende. Wer möchte mitmachen und unsere Küste sauber halten?",
    timestamp: "vor 3 Stunden",
    likes: 18,
    comments: 6,
    type: "event",
  },
]

// Calendar data for demo
const calendarDays = Array.from({ length: 35 }, (_, i) => {
  const dayNum = i - 3 // Start from previous month
  const isCurrentMonth = dayNum >= 1 && dayNum <= 31
  const hasEvent = [5, 12, 15, 22, 28].includes(dayNum)
  const isToday = dayNum === 15
  return {
    number: isCurrentMonth ? dayNum : dayNum <= 0 ? 31 + dayNum : dayNum - 31,
    isCurrentMonth,
    hasEvent: isCurrentMonth && hasEvent,
    isToday: isCurrentMonth && isToday,
  }
})

function FeedView() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Users} value={24} label="Mitglieder" color="blue" />
        <StatCard icon={Calendar} value={3} label="Events" color="green" />
        <StatCard icon={MessageCircle} value={47} label="Posts" color="orange" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <ActionCard
          icon={Plus}
          label="Neues Event"
          description="Termin erstellen"
          variant="primary"
          onClick={() => console.log("New event")}
        />
        <ActionCard
          icon={UserPlus}
          label="Einladen"
          description="Mitglieder hinzufügen"
          variant="secondary"
          onClick={() => console.log("Invite")}
        />
      </div>

      {/* Post Widget */}
      <SimplePostWidget
        placeholder="Was gibt's Neues in der Nachbarschaft?"
        onSubmit={(content: string) => console.log("Post:", content)}
      />

      {/* Posts Feed */}
      <div className="space-y-4">
        {demoPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onLike={(id: string) => console.log("Like:", id)}
            onComment={(id: string) => console.log("Comment:", id)}
            onShare={(id: string) => console.log("Share:", id)}
          />
        ))}
      </div>
    </div>
  )
}

function MapView() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-gradient-to-br from-primary/5 via-primary/10 to-secondary/5">
            {/* Decorative map elements */}
            <div className="absolute inset-0">
              {/* Grid lines */}
              <div className="absolute inset-0 opacity-20">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute h-px bg-primary/30 w-full"
                    style={{ top: `${(i + 1) * 12.5}%` }}
                  />
                ))}
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={`v-${i}`}
                    className="absolute w-px bg-primary/30 h-full"
                    style={{ left: `${(i + 1) * 12.5}%` }}
                  />
                ))}
              </div>

              {/* Location markers */}
              <div className="absolute top-1/4 left-1/3 animate-pulse">
                <div className="relative">
                  <MapPin className="h-8 w-8 text-primary drop-shadow-lg" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-primary/20 rounded-full blur-sm" />
                </div>
              </div>
              <div className="absolute top-1/2 left-2/3">
                <div className="relative">
                  <MapPin className="h-6 w-6 text-secondary drop-shadow-lg" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-1 bg-secondary/20 rounded-full blur-sm" />
                </div>
              </div>
              <div className="absolute top-2/3 left-1/4">
                <div className="relative">
                  <MapPin className="h-6 w-6 text-accent drop-shadow-lg" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-1 bg-accent/20 rounded-full blur-sm" />
                </div>
              </div>
            </div>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border">
                <MapPin className="h-12 w-12 text-primary mx-auto mb-3" />
                <p className="text-foreground font-semibold text-center">
                  Interaktive Karte
                </p>
                <p className="text-muted-foreground text-sm text-center mt-1">
                  Entdecke Events und Mitglieder in deiner Nähe
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nearby locations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">In der Nähe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "Gemeinschaftsgarten", distance: "250m", type: "Ort" },
            { name: "Café Nachbar", distance: "400m", type: "Treffpunkt" },
            { name: "Repair Café", distance: "800m", type: "Event" },
          ].map((place, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{place.name}</p>
                <p className="text-xs text-muted-foreground">{place.type}</p>
              </div>
              <span className="text-sm text-muted-foreground">
                {place.distance}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function CalendarView() {
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

  const upcomingEvents = [
    {
      title: "Pflanzaktion",
      date: "Di, 15. Jan",
      time: "19:00",
      attendees: 8,
    },
    {
      title: "Nachbarschaftstreffen",
      date: "Sa, 22. Jan",
      time: "14:00",
      attendees: 15,
    },
    {
      title: "Repair Café",
      date: "So, 28. Jan",
      time: "11:00",
      attendees: 12,
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Januar 2026</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm">
                &lt;
              </Button>
              <Button variant="ghost" size="sm">
                &gt;
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekdays.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => (
              <button
                key={i}
                className={`
                  aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all
                  ${!day.isCurrentMonth ? "text-muted-foreground/40" : "text-foreground"}
                  ${day.isToday ? "bg-primary text-primary-foreground font-bold" : ""}
                  ${day.hasEvent && !day.isToday ? "bg-primary/10 font-medium" : ""}
                  ${day.isCurrentMonth && !day.isToday ? "hover:bg-muted" : ""}
                `}
              >
                {day.number}
                {day.hasEvent && (
                  <div
                    className={`w-1 h-1 rounded-full mt-0.5 ${day.isToday ? "bg-primary-foreground" : "bg-primary"}`}
                  />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anstehende Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingEvents.map((event, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
            >
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex flex-col items-center justify-center text-primary-foreground">
                <span className="text-xs font-medium">
                  {event.date.split(",")[0]}
                </span>
                <span className="text-lg font-bold leading-none">
                  {event.date.match(/\d+/)?.[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{event.title}</p>
                <p className="text-sm text-muted-foreground">
                  {event.time} Uhr
                </p>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex -space-x-2">
                  {Array.from({ length: Math.min(3, event.attendees) }).map(
                    (_, j) => (
                      <Avatar key={j} className="h-6 w-6 border-2 border-background">
                        <AvatarFallback className="text-[10px] bg-muted">
                          {String.fromCharCode(65 + j)}
                        </AvatarFallback>
                      </Avatar>
                    )
                  )}
                </div>
                {event.attendees > 3 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    +{event.attendees - 3}
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Home() {
  const [activeWorkspace, setActiveWorkspace] = useState(workspaces[0])
  const [activeModule, setActiveModule] = useState("feed")
  const [isDark, setIsDark] = useState(false)

  const handleModuleChange = (moduleId: string) => {
    setActiveModule(moduleId)
  }

  const toggleTheme = () => {
    setIsDark(!isDark)
    document.documentElement.classList.toggle("dark")
  }

  return (
    <AppShell>
      <Navbar>
        <NavbarStart>
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onWorkspaceChange={setActiveWorkspace}
            onCreateWorkspace={() => console.log("Create workspace")}
          />
        </NavbarStart>
        <NavbarCenter>
          <ModuleTabs
            modules={modules}
            activeModule={activeModule}
            onModuleChange={handleModuleChange}
          />
        </NavbarCenter>
        <NavbarEnd>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <UserMenu
            user={user}
            onProfile={() => console.log("Profile")}
            onSettings={() => console.log("Settings")}
            onLogout={() => console.log("Logout")}
          />
        </NavbarEnd>
      </Navbar>

      <AppShellMain withBottomNav className="container mx-auto max-w-2xl px-4 py-6">
        {activeModule === "feed" && <FeedView />}
        {activeModule === "map" && <MapView />}
        {activeModule === "calendar" && <CalendarView />}
      </AppShellMain>

      <BottomNav
        items={modules}
        activeItem={activeModule}
        onItemChange={handleModuleChange}
      />
    </AppShell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
