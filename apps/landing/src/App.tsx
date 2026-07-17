import { useState, useRef, useEffect } from 'react'
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
  Puzzle,
  Store,
  Globe,
  HardDrive,
  Lock,
  Fingerprint,
  Waypoints,
  ChevronDown,
} from 'lucide-react'
import { useLanguage, SUPPORTED_LANGUAGES } from './i18n/LanguageContext'

function WotIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="18.72" cy="8.82" r="3" />
      <circle cx="5.28" cy="5.28" r="3" />
      <circle cx="8.82" cy="18.72" r="3" />
      <line x1="6.04" x2="8.06" y1="8.18" y2="15.82" />
      <line x1="15.81" x2="8.18" y1="8.05" y2="6.04" />
      <line x1="16.59" x2="10.94" y1="10.94" y2="16.59" />
    </svg>
  )
}

function GitHubIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10,0 C15.523,0 20,4.59 20,10.253 C20,14.782 17.138,18.624 13.167,19.981 C12.66,20.082 12.48,19.762 12.48,19.489 C12.48,19.151 12.492,18.047 12.492,16.675 C12.492,15.719 12.172,15.095 11.813,14.777 C14.04,14.523 16.38,13.656 16.38,9.718 C16.38,8.598 15.992,7.684 15.35,6.966 C15.454,6.707 15.797,5.664 15.252,4.252 C15.252,4.252 14.414,3.977 12.505,5.303 C11.706,5.076 10.85,4.962 10,4.958 C9.15,4.962 8.295,5.076 7.497,5.303 C5.586,3.977 4.746,4.252 4.746,4.252 C4.203,5.664 4.546,6.707 4.649,6.966 C4.01,7.684 3.619,8.598 3.619,9.718 C3.619,13.646 5.954,14.526 8.175,14.785 C7.889,15.041 7.63,15.493 7.54,16.156 C6.97,16.418 5.522,16.871 4.63,15.304 C4.63,15.304 4.101,14.319 3.097,14.247 C3.097,14.247 2.122,14.234 3.029,14.87 C3.029,14.87 3.684,15.185 4.139,16.37 C4.139,16.37 4.726,18.2 7.508,17.58 C7.513,18.437 7.522,19.245 7.522,19.489 C7.522,19.76 7.338,20.077 6.839,19.982 C2.865,18.627 0,14.783 0,10.253 C0,4.59 4.478,0 10,0" />
    </svg>
  )
}

function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === language)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
        aria-label="Select language"
      >
        <span>{currentLang?.flag}</span>
        <span className="uppercase">{language}</span>
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 py-1 bg-background border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code)
                setOpen(false)
              }}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors ${
                language === lang.code ? 'text-primary font-medium' : 'text-muted-foreground'
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { t } = useLanguage()

  const navItems = [
    { label: t.nav.modules, href: '#module' },
    { label: t.nav.dataInterface, href: '#schnittstelle' },
    { label: t.nav.connectors, href: '#connectoren' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Puzzle className="w-6 h-6 text-primary-foreground" />
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
            <LanguageSwitcher />
            <Button asChild>
              <a
                href="https://github.com/real-life-org/real-life-stack"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitHubIcon className="w-5 h-5" />
                GitHub
              </a>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-1">
            <LanguageSwitcher />
            <button
              className="p-2 text-muted-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
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
                  href="https://github.com/real-life-org/real-life-stack"
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

function PrivacyContentDe() {
  return (
    <>
      <h1 className="text-3xl font-bold mb-1">Datenschutzerklärung</h1>
      <p className="text-muted-foreground text-sm mb-8">Zuletzt aktualisiert: April 2026</p>

      <h2 className="text-xl font-semibold mt-8 mb-3">1. Verantwortlicher</h2>
      <p>Anton Tranelis · E-Mail: <a href="mailto:info@real-life.org" className="text-primary hover:underline">info@real-life.org</a></p>

      <h2 className="text-xl font-semibold mt-8 mb-3">2. Grundprinzip</h2>
      <p>
        Real Life Stack ist ein modularer Baukasten für Community-Apps.
        <strong> Deine Daten gehören dir.</strong> Je nach gewähltem Connector werden
        Daten ausschließlich lokal, auf deinem eigenen Server oder Ende-zu-Ende-verschlüsselt
        gespeichert.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">3. Welche Daten werden verarbeitet?</h2>

      <h3 className="text-lg font-medium mt-6 mb-2">Lokales Backend</h3>
      <p>
        Alle Daten werden ausschließlich lokal auf deinem Gerät gespeichert (IndexedDB).
        Es findet keine Übertragung an externe Server statt.
      </p>

      <h3 className="text-lg font-medium mt-6 mb-2">GraphQL-Backend (optional)</h3>
      <p>
        Wenn du dich mit einem eigenen Server verbindest, gelten die Datenschutzbestimmungen
        des jeweiligen Betreibers.
      </p>

      <h3 className="text-lg font-medium mt-6 mb-2">Web-of-Trust-Backend (optional)</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li>Daten werden dezentral und Ende-zu-Ende-verschlüsselt synchronisiert</li>
        <li>Öffentliche Profile (Name, Bio, Avatar) werden bewusst vom Nutzer veröffentlicht</li>
        <li>Bestätigungen die du an andere sendest, liegen auf deren Geräten und können nicht einseitig zurückgezogen werden</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 mb-3">4. Berechtigungen</h2>
      <p>
        Die App fragt nur die Berechtigungen an, die für die genutzten Funktionen notwendig sind
        (z.B. Standort für die Kartenansicht, Kamera für QR-Code-Scan, Biometrie zum Entsperren).
        Es werden keine Daten ohne Einwilligung erhoben.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">5. Tracking & Analytics</h2>
      <p>
        <strong>Es gibt kein Tracking.</strong> Keine Analytics, keine Cookies, keine Werbe-IDs.
        Die App enthält keine Drittanbieter-SDKs die Nutzerdaten sammeln.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">6. Datenlöschung</h2>
      <p>
        <strong>Lokale Daten</strong> kannst du jederzeit über die App löschen.
      </p>
      <p>
        <strong>Server-Daten</strong> (Profile, Backups) können über die App zurückgezogen werden.
      </p>
      <p>
        <strong>Einschränkung:</strong> Daten die du mit anderen geteilt hast (z.B. Bestätigungen),
        liegen auf deren Geräten und können von dir nicht gelöscht werden.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">7. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung
        deiner Daten sowie das Recht auf Datenübertragbarkeit. Du hast außerdem das Recht, dich bei
        einer Datenschutz-Aufsichtsbehörde zu beschweren.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">8. Open Source</h2>
      <p>
        Der vollständige Quellcode ist unter der MIT-Lizenz verfügbar:{' '}
        <a href="https://github.com/real-life-org/real-life-stack" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          github.com/real-life-org/real-life-stack
        </a>
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">9. Kontakt</h2>
      <p>Bei Fragen zum Datenschutz: <a href="mailto:info@real-life.org" className="text-primary hover:underline">info@real-life.org</a></p>
    </>
  )
}

function PrivacyContentEn() {
  return (
    <>
      <h1 className="text-3xl font-bold mb-1">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm mb-8">Last updated: April 2026</p>

      <h2 className="text-xl font-semibold mt-8 mb-3">1. Controller</h2>
      <p>Anton Tranelis · Email: <a href="mailto:info@real-life.org" className="text-primary hover:underline">info@real-life.org</a></p>

      <h2 className="text-xl font-semibold mt-8 mb-3">2. Core Principle</h2>
      <p>
        Real Life Stack is a modular toolkit for community apps.
        <strong> Your data belongs to you.</strong> Depending on the chosen connector, data is
        stored exclusively locally, on your own server, or end-to-end encrypted.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">3. What Data Is Processed?</h2>

      <h3 className="text-lg font-medium mt-6 mb-2">Local backend</h3>
      <p>
        All data is stored exclusively locally on your device (IndexedDB).
        No data is transferred to external servers.
      </p>

      <h3 className="text-lg font-medium mt-6 mb-2">GraphQL backend (optional)</h3>
      <p>
        If you connect to your own server, the privacy policy of the respective operator applies.
      </p>

      <h3 className="text-lg font-medium mt-6 mb-2">Web of Trust backend (optional)</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li>Data is synchronized in a decentralized, end-to-end encrypted way</li>
        <li>Public profiles (name, bio, avatar) are deliberately published by the user</li>
        <li>Confirmations you send to others are stored on their devices and cannot be unilaterally withdrawn</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 mb-3">4. Permissions</h2>
      <p>
        The app only requests the permissions required for the features you use
        (e.g. location for the map view, camera for QR-code scanning, biometrics for unlocking).
        No data is collected without consent.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">5. Tracking & Analytics</h2>
      <p>
        <strong>There is no tracking.</strong> No analytics, no cookies, no advertising IDs.
        The app contains no third-party SDKs that collect user data.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">6. Data Deletion</h2>
      <p>
        <strong>Local data</strong> can be deleted at any time via the app.
      </p>
      <p>
        <strong>Server data</strong> (profiles, backups) can be withdrawn via the app.
      </p>
      <p>
        <strong>Limitation:</strong> Data you have shared with others (e.g. confirmations)
        is stored on their devices and cannot be deleted by you.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">7. Your Rights</h2>
      <p>
        You have the right to access, rectify, delete, and restrict the processing of your data,
        as well as the right to data portability. You also have the right to lodge a complaint
        with a data protection supervisory authority.
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">8. Open Source</h2>
      <p>
        The complete source code is available under the MIT license:{' '}
        <a href="https://github.com/real-life-org/real-life-stack" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          github.com/real-life-org/real-life-stack
        </a>
      </p>

      <h2 className="text-xl font-semibold mt-8 mb-3">9. Contact</h2>
      <p>For questions about privacy: <a href="mailto:info@real-life.org" className="text-primary hover:underline">info@real-life.org</a></p>
    </>
  )
}

function PrivacyPage() {
  const { language, t } = useLanguage()

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4">
        <article className="max-w-3xl mx-auto prose prose-stone dark:prose-invert">
          {language === 'de' ? <PrivacyContentDe /> : <PrivacyContentEn />}
        </article>
      </main>

      <footer className="py-12 px-4 border-t">
        <div className="max-w-4xl mx-auto text-center text-muted-foreground">
          <a href="/" className="text-sm hover:text-foreground transition-colors">{t.footer.backHome}</a>
        </div>
      </footer>
    </div>
  )
}

function App() {
  const { t } = useLanguage()

  if (window.location.pathname === '/privacy' || window.location.pathname === '/privacy.html') {
    return <PrivacyPage />
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            {t.hero.title}{' '}
            <span className="text-primary">{t.hero.titleHighlight}</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t.hero.subtitle}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" asChild>
              <a href="/app/">
                {t.hero.demo}
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="/storybook/">
                {t.hero.storybook}
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Section 1: App Shell & Modules */}
      <section id="module" className="py-16 px-4 bg-muted/30 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-primary text-sm font-medium mb-4">
                <div className="size-2 rounded-full bg-primary" />
                {t.modules.badge}
              </div>
              <h2 className="text-3xl font-bold mb-4">{t.modules.title}</h2>
              <p className="text-muted-foreground mb-6">{t.modules.p1}</p>
              <p className="text-muted-foreground">{t.modules.p2}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ModuleCard icon={Map} title={t.modules.map} description={t.modules.mapDesc} color="green" />
              <ModuleCard icon={Calendar} title={t.modules.calendar} description={t.modules.calendarDesc} color="blue" />
              <ModuleCard icon={Store} title={t.modules.marketplace} description={t.modules.marketplaceDesc} color="purple" />
              <ModuleCard icon={MessageSquare} title={t.modules.feed} description={t.modules.feedDesc} color="orange" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Data & Identity Interface */}
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
                        <div className="font-medium">{t.dataInterface.groups}</div>
                        <div className="text-sm text-muted-foreground">{t.dataInterface.groupsDesc}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Calendar className="size-4" />
                      </div>
                      <div>
                        <div className="font-medium">{t.dataInterface.events}</div>
                        <div className="text-sm text-muted-foreground">{t.dataInterface.eventsDesc}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Shield className="size-4" />
                      </div>
                      <div>
                        <div className="font-medium">{t.dataInterface.trust}</div>
                        <div className="text-sm text-muted-foreground">{t.dataInterface.trustDesc}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 text-blue-600 text-sm font-medium mb-4">
                <div className="size-2 rounded-full bg-blue-500" />
                {t.dataInterface.badge}
              </div>
              <h2 className="text-3xl font-bold mb-4">{t.dataInterface.title}</h2>
              <p className="text-muted-foreground mb-6">{t.dataInterface.p1}</p>
              <p className="text-muted-foreground">{t.dataInterface.p2}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Connector Layer */}
      <section id="connectoren" className="py-16 px-4 bg-muted/30 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-green-600 text-sm font-medium mb-4">
                <div className="size-2 rounded-full bg-green-500" />
                {t.connectors.badge}
              </div>
              <h2 className="text-3xl font-bold mb-4">{t.connectors.title}</h2>
              <p className="text-muted-foreground mb-6">{t.connectors.p1}</p>
              <p className="text-muted-foreground">{t.connectors.p2}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'REST', desc: t.connectors.restDesc, icon: Globe, color: 'text-blue-600' },
                { name: 'GraphQL', desc: t.connectors.graphqlDesc, icon: Waypoints, color: 'text-purple-600' },
                { name: 'Local-first', desc: t.connectors.localDesc, icon: HardDrive, color: 'text-green-600' },
                { name: 'P2P', desc: t.connectors.p2pDesc, icon: WotIcon, color: 'text-orange-600' },
                { name: 'E2EE', desc: t.connectors.e2eeDesc, icon: Lock, color: 'text-red-600' },
                { name: 'DIDs', desc: t.connectors.didsDesc, icon: Fingerprint, color: 'text-teal-600' },
              ].map((backend) => (
                <Card key={backend.name} className="py-0">
                  <CardContent className="px-3 py-2.5 flex items-center gap-2">
                    <backend.icon className={`size-5 shrink-0 ${backend.color}`} />
                    <div>
                      <div className="font-medium text-sm">{backend.name}</div>
                      <div className="text-xs text-muted-foreground">{backend.desc}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t">
        <div className="max-w-4xl mx-auto text-center text-muted-foreground">
          <p className="mb-4">
            <strong>{t.footer.tagline}</strong>
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="https://github.com/real-life-org/real-life-stack"
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
            <a
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
              {t.footer.privacy}
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
  color?: 'primary' | 'blue' | 'orange' | 'purple' | 'green'
}) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
  }

  return (
    <Card className="text-center">
      <CardContent className="pt-4">
        <div className={`inline-flex items-center justify-center size-10 rounded-lg mb-3 ${colorClasses[color]}`}>
          <Icon className="size-5" />
        </div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export default App
