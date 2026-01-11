import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
} from '@real-life-stack/toolkit'
import {
  Map,
  Calendar,
  Users,
  MessageSquare,
  Shield,
  ExternalLink,
  ArrowRight,
  Menu,
  X,
  Sprout,
  Store,
} from 'lucide-react'

function GitHubIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10,0 C15.523,0 20,4.59 20,10.253 C20,14.782 17.138,18.624 13.167,19.981 C12.66,20.082 12.48,19.762 12.48,19.489 C12.48,19.151 12.492,18.047 12.492,16.675 C12.492,15.719 12.172,15.095 11.813,14.777 C14.04,14.523 16.38,13.656 16.38,9.718 C16.38,8.598 15.992,7.684 15.35,6.966 C15.454,6.707 15.797,5.664 15.252,4.252 C15.252,4.252 14.414,3.977 12.505,5.303 C11.706,5.076 10.85,4.962 10,4.958 C9.15,4.962 8.295,5.076 7.497,5.303 C5.586,3.977 4.746,4.252 4.746,4.252 C4.203,5.664 4.546,6.707 4.649,6.966 C4.01,7.684 3.619,8.598 3.619,9.718 C3.619,13.646 5.954,14.526 8.175,14.785 C7.889,15.041 7.63,15.493 7.54,16.156 C6.97,16.418 5.522,16.871 4.63,15.304 C4.63,15.304 4.101,14.319 3.097,14.247 C3.097,14.247 2.122,14.234 3.029,14.87 C3.029,14.87 3.684,15.185 4.139,16.37 C4.139,16.37 4.726,18.2 7.508,17.58 C7.513,18.437 7.522,19.245 7.522,19.489 C7.522,19.76 7.338,20.077 6.839,19.982 C2.865,18.627 0,14.783 0,10.253 C0,4.59 4.478,0 10,0" />
    </svg>
  )
}

const navItems = [
  { label: 'Module', href: '#module' },
  { label: 'Schnittstelle', href: '#schnittstelle' },
  { label: 'Connectoren', href: '#connectoren' },
]

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Sprout className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground">Real Life Stack</span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {item.label}
              </a>
            ))}
            <Button asChild>
              <a
                href="https://github.com/IT4Change/real-life-stack"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitHubIcon className="w-5 h-5" />
                GitHub
              </a>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-muted-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-base font-medium text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <Button asChild className="w-full">
                <a
                  href="https://github.com/IT4Change/real-life-stack"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GitHubIcon className="w-5 h-5" />
                  GitHub
                </a>
              </Button>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Modularer Baukasten für{' '}
            <span className="text-primary">lokale Vernetzung</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Selbstorganisation leicht gemacht – Werkzeuge für echte Zusammenarbeit,
            die Gruppen dabei helfen, gemeinsam vor Ort etwas zu bewegen.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" asChild>
              <a href="/app/">
                Demo ansehen
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="/storybook/">
                Storybook
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Section 1: App-Shell & Module */}
      <section id="module" className="py-16 px-4 bg-muted/30 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-primary text-sm font-medium mb-4">
                <div className="size-2 rounded-full bg-primary" />
                App-Shell & Module
              </div>
              <h2 className="text-3xl font-bold mb-4">Modularer Frontend-Baukasten</h2>
              <p className="text-muted-foreground mb-6">
                Real Life Stack wird als modularer Frontend-Baukasten in TypeScript mit React entwickelt.
                Er umfasst eigenständige Komponenten, die sowohl in der Referenzanwendung als auch als
                wiederverwendbare Library in eigenen Projekten eingesetzt werden können.
              </p>
              <p className="text-muted-foreground">
                Zusätzlich entsteht eine selbsthostbare White-Label-App mit einer intuitiven
                Admin-Konfigurationsoberfläche, über die Gruppen ohne technisches Know-how Module
                aktivieren, Farben und Inhalte anpassen können.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ModuleCard icon={Map} title="Karte" description="OpenStreetMap via MapLibre" color="primary" />
              <ModuleCard icon={Calendar} title="Kalender" description="iCal / CalDAV" color="blue" />
              <ModuleCard icon={MessageSquare} title="Feed" description="Aktivitäten-Stream" color="orange" />
              <ModuleCard icon={Store} title="Marktplatz" description="Teilen & Tauschen" color="purple" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Daten- & Identitätsschnittstelle */}
      <section id="schnittstelle" className="py-16 px-4 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Users className="size-4" />
                      </div>
                      <div>
                        <div className="font-medium">Gruppen & Profile</div>
                        <div className="text-sm text-muted-foreground">Laden und Speichern von Mitgliedschaften</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Calendar className="size-4" />
                      </div>
                      <div>
                        <div className="font-medium">Termine & Events</div>
                        <div className="text-sm text-muted-foreground">Einheitliche Funktionen für Kalendereinträge</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Shield className="size-4" />
                      </div>
                      <div>
                        <div className="font-medium">Vertrauensbeziehungen</div>
                        <div className="text-sm text-muted-foreground">Web of Trust & Identitätsverwaltung</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 text-blue-600 text-sm font-medium mb-4">
                <div className="size-2 rounded-full bg-blue-500" />
                Daten- & Identitätsschnittstelle
              </div>
              <h2 className="text-3xl font-bold mb-4">Einheitliche Schnittstelle</h2>
              <p className="text-muted-foreground mb-6">
                Alle Module greifen auf eine gemeinsame Daten- und Identitätsschnittstelle im Frontend zu.
                Diese definiert einheitliche Funktionen zum Laden und Speichern von Gruppen, Terminen,
                Profilen und Vertrauensbeziehungen.
              </p>
              <p className="text-muted-foreground">
                Die Module kennen nur diese Schnittstelle – unabhängig davon, welches Backend
                genutzt wird oder wie Identitäten verwaltet sind. Die offene Identitätsschnittstelle
                soll perspektivisch auch schlüsselbasierte Accounts und DIDs unterstützen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Connector-Schicht */}
      <section id="connectoren" className="py-16 px-4 bg-muted/30 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-orange-600 text-sm font-medium mb-4">
                <div className="size-2 rounded-full bg-orange-500" />
                Connector-Schicht
              </div>
              <h2 className="text-3xl font-bold mb-4">Flexibel wählbare Backends</h2>
              <p className="text-muted-foreground mb-6">
                Unterhalb der Datenschnittstelle liegt eine schlanke Connector-Struktur.
                Sie legt fest, wie Backends angebunden werden, und wir liefern eine erste
                Implementierung mit.
              </p>
              <p className="text-muted-foreground">
                Weitere Connectoren können von Communities selbst entwickelt werden –
                von klassischen REST-APIs bis hin zu vollständig dezentralen,
                Ende-zu-Ende-verschlüsselten Systemen.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'REST', desc: 'Klassischer Server', icon: '🌐' },
                { name: 'GraphQL', desc: 'Flexible Queries', icon: '📊' },
                { name: 'Local-first', desc: 'Offline-fähig', icon: '💾' },
                { name: 'P2P', desc: 'Dezentral', icon: '🔗' },
                { name: 'E2EE', desc: 'Verschlüsselt', icon: '🔒' },
                { name: 'DIDs', desc: 'Selbstbestimmte Identität', icon: '🪪' },
              ].map((backend) => (
                <div
                  key={backend.name}
                  className="p-4 bg-background border border-orange-200 rounded-lg hover:border-orange-400 transition-colors"
                >
                  <div className="text-2xl mb-2">{backend.icon}</div>
                  <div className="font-medium text-sm">{backend.name}</div>
                  <div className="text-xs text-muted-foreground">{backend.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t">
        <div className="max-w-4xl mx-auto text-center text-muted-foreground">
          <p className="mb-4">
            <strong>Gemeinsam gestalten wir die Zukunft – lokal vernetzt, global gedacht.</strong>
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="https://github.com/IT4Change/real-life-stack"
              className="hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener"
            >
              GitHub
            </a>
            <a
              href="/storybook/"
              className="hover:text-foreground transition-colors"
            >
              Storybook
            </a>
            <a
              href="https://web-of-trust.de"
              className="hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener"
            >
              Web-of-Trust
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ModuleCard({
  icon: Icon,
  title,
  description,
  color = 'primary',
}: {
  icon: typeof Map
  title: string
  description: string
  color?: 'primary' | 'blue' | 'orange' | 'purple'
}) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
  }

  return (
    <Card className="text-center">
      <CardContent className="pt-6">
        <div className={`inline-flex items-center justify-center size-12 rounded-lg mb-4 ${colorClasses[color]}`}>
          <Icon className="size-6" />
        </div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export default App
