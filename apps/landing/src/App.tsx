import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@real-life-stack/toolkit'
import {
  Map,
  Calendar,
  Users,
  MessageSquare,
  Shield,
  Smartphone,
  ExternalLink,
  ArrowRight,
  Menu,
  X,
  Code,
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
  { label: 'Architektur', href: '#architektur' },
  { label: 'Features', href: '#features' },
  { label: 'Demos', href: '#demos' },
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
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary-foreground" fill="currentColor" stroke="currentColor" strokeWidth="1">
                <circle cx="7" cy="8" r="2" />
                <circle cx="17" cy="8" r="2" />
                <circle cx="12" cy="17" r="2" />
                <path d="M7 8L17 8M7 8L12 17M17 8L12 17" strokeWidth="1.5" fill="none" />
              </svg>
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

      {/* Module Section */}
      <section id="module" className="py-16 px-4 bg-muted/30 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Module</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ModuleCard
              icon={Map}
              title="Karte"
              description="Lokale Orte, Ressourcen und Aktivitäten visualisieren"
            />
            <ModuleCard
              icon={Calendar}
              title="Kalender"
              description="Events planen und Termine koordinieren"
            />
            <ModuleCard
              icon={MessageSquare}
              title="Feed"
              description="Aktivitäten-Stream aus der Community"
            />
            <ModuleCard
              icon={Users}
              title="Gruppen"
              description="Gemeinsame Ressourcen und Zusammenarbeit"
            />
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section id="architektur" className="py-16 px-4 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Architektur</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Ein modularer Aufbau in drei Schichten – flexibel anpassbar an die Bedürfnisse jeder Community.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Layer 1: App-Shell + Module */}
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
              <CardHeader>
                <div className="text-sm font-medium text-primary mb-1">Schicht 1</div>
                <CardTitle>App-Shell & Module</CardTitle>
                <CardDescription>
                  Die sichtbare Oberfläche – anpassbar und erweiterbar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {['Kalender', 'Karte', 'Feed', 'Gruppen', 'Profile'].map((module) => (
                    <span
                      key={module}
                      className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded"
                    >
                      {module}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Jede Community wählt die Module, die sie braucht. Eigene Module können hinzugefügt werden.
                </p>
              </CardContent>
            </Card>

            {/* Layer 2: Data & Identity Interface */}
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-secondary" />
              <CardHeader>
                <div className="text-sm font-medium text-secondary mb-1">Schicht 2</div>
                <CardTitle>Daten & Identität</CardTitle>
                <CardDescription>
                  Einheitliche Schnittstelle für alle Module
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-secondary" />
                    <span>Posts, Events, Orte, Profile</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-secondary" />
                    <span>Login & Authentifizierung</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-secondary" />
                    <span>Vertrauensbeziehungen</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Module kennen nur diese Schnittstelle – nicht das Backend dahinter.
                </p>
              </CardContent>
            </Card>

            {/* Layer 3: Connector & Backends */}
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-accent" />
              <CardHeader>
                <div className="text-sm font-medium text-accent mb-1">Schicht 3</div>
                <CardTitle>Connector & Backend</CardTitle>
                <CardDescription>
                  Flexibel wählbare Infrastruktur
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'REST', desc: 'Klassisch' },
                    { name: 'Local-first', desc: 'Offline' },
                    { name: 'P2P', desc: 'Dezentral' },
                    { name: 'E2EE', desc: 'Verschlüsselt' },
                  ].map((backend) => (
                    <div key={backend.name} className="p-2 bg-muted rounded text-center">
                      <div className="font-medium text-sm">{backend.name}</div>
                      <div className="text-xs text-muted-foreground">{backend.desc}</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Von einfachem Server bis vollständig dezentral – ihr entscheidet.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 px-4 bg-muted/30 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Warum Real Life Stack?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={Smartphone}
              title="White-Label-App"
              description="Sofort einsetzbar, ohne Programmierkenntnisse anpassbar. Jede Community kann ihre eigene App haben."
            />
            <FeatureCard
              icon={Shield}
              title="Web of Trust"
              description="Vertrauensbasierte Identität durch reale Begegnungen. Keine zentrale Kontrolle über eure Daten."
            />
            <FeatureCard
              icon={Code}
              title="Open Source"
              description="Vollständig quelloffen und von der Community entwickelt. Transparent und nachvollziehbar."
            />
          </div>
        </div>
      </section>

      {/* Demos Section */}
      <section id="demos" className="py-16 px-4 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Demos</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Reference App</CardTitle>
                <CardDescription>
                  React 19 Implementierung mit allen Modulen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <a href="/app/">
                    Zur App
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>UI Prototype</CardTitle>
                <CardDescription>
                  Experimentelle UI-Konzepte und Komponenten
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild className="w-full">
                  <a href="/edge/">
                    Zum Prototype
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
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
}: {
  icon: typeof Map
  title: string
  description: string
}) {
  return (
    <Card className="text-center">
      <CardContent className="pt-6">
        <div className="inline-flex items-center justify-center size-12 rounded-lg bg-primary/10 text-primary mb-4">
          <Icon className="size-6" />
        </div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Map
  title: string
  description: string
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center size-14 rounded-full bg-primary/10 text-primary mb-4">
        <Icon className="size-7" />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}

export default App
