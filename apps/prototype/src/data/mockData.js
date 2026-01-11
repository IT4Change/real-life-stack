import { subDays, subHours, subMinutes, addDays, addWeeks, set } from 'date-fns';
import { initializeNotifications } from './mockNotifications';
import { initializeMessages } from './mockMessages';

const mockUsers = {
  'user-1': {
    name: 'Lena Weber',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
    banner: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=200&fit=crop',
    bio: '# Über mich\n\nHallo! Ich bin **Lena** und liebe es, neue Menschen kennenzulernen und gemeinsam Projekte zu verwirklichen. Als *Yoga-Lehrerin* bringe ich gerne Ruhe und Achtsamkeit in unsere Community.\n\n## Meine Interessen\n- Yoga & Meditation\n- Nachhaltigkeit\n- Community Building',
    contactInfo: { email: 'lena@example.com', phone: '+49 30 12345678', website: 'https://lena-yoga.de' },
    badges: ['Community-Organisatorin', 'Yoga-Lehrerin', 'Früher Vogel']
  },
  'user-2': {
    name: 'Max Schmidt',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face',
    banner: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=200&fit=crop',
    bio: '# Hey, ich bin Max!\n\nSoftware-Entwickler und **Community-Enthusiast**. Ich organisiere gerne Events und helfe bei technischen Projekten.\n\n## Skills\n- Web Development\n- Community Management\n- Eventplanung',
    contactInfo: { email: 'max@example.com', phone: '+49 30 23456789' },
    badges: ['Technik-Experte', 'Event-Organisator', 'Hilfsbereiter Nachbar']
  },
  'user-3': {
    name: 'Julia Klein',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face',
    banner: 'https://images.unsplash.com/photo-1495954484750-af469f2f9be5?w=800&h=200&fit=crop',
    bio: 'Handwerkerin mit Herz! Ich teile gerne meine Werkzeuge und mein Wissen.',
    contactInfo: { email: 'julia@example.com' },
    badges: ['Handwerk-Profi', 'Teilen macht Freude']
  },
  'user-4': { name: 'Thomas Müller', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face' },
  'user-5': { name: 'Sarah Fischer', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face' },
  'user-6': { name: 'Michael Wagner', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face' },
  'user-7': { name: 'Anna Becker', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=100&h=100&fit=crop&crop=face' },
  'user-8': {
    name: 'David Hoffmann',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&crop=face',
    banner: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&h=200&fit=crop',
    bio: '# Coding & Teaching\n\nPassionierter **Programmierer** und Lehrer. Ich gebe gerne mein Wissen weiter und helfe Anfängern beim Einstieg in die Webentwicklung.\n\n## Expertise\n- JavaScript & React\n- Python\n- Teaching & Mentoring',
    contactInfo: { email: 'david@coding-berlin.de', website: 'https://coding-berlin.de' },
    badges: ['Code-Mentor', 'JavaScript-Ninja', 'Geduldiger Lehrer']
  },
  'user-9': { name: 'Emma Schulz', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face' },
  'user-10': { name: 'Felix Richter', avatar: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=100&h=100&fit=crop&crop=face' },
};

const mockPosts = [
  // Person Profile 1: Lena Weber
  {
    id: 'person-1',
    type: 'person',
    authorId: 'user-1',
    createdAt: subDays(new Date(), 30).toISOString(),
    title: 'Lena Weber',
    content: '# Über mich\n\nHallo! Ich bin **Lena** und liebe es, neue Menschen kennenzulernen und gemeinsam Projekte zu verwirklichen. Als *Yoga-Lehrerin* bringe ich gerne Ruhe und Achtsamkeit in unsere Community.\n\n## Meine Interessen\n- Yoga & Meditation\n- Nachhaltigkeit\n- Community Building\n\n## Ich biete\n- Kostenlose Yoga-Sessions im Park\n- Meditationsworkshops\n- Beratung zu achtsamer Lebensführung',
    location: { lat: 52.520, lon: 13.401, name: 'Prenzlauer Berg, Berlin' },
    reactions: { '❤️': 45, '👍': 32 },
    comments: [
      { id: 'c-p1-1', authorId: 'user-2', text: 'Super dass du dabei bist!', createdAt: subDays(new Date(), 5).toISOString(), replies: [] },
    ],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1588286840104-8957b019727f?w=500&q=80' }
    ],
    contactInfo: { email: 'lena@example.com', phone: '+49 30 12345678', website: 'https://lena-yoga.de' },
    badges: ['Community-Organisatorin', 'Yoga-Lehrerin', 'Früher Vogel'],
    projects: ['post-2', 'post-garden'],
    comingEvents: ['post-1', 'post-event-2']
  },

  // Quest 1: Nachbarschaftshilfe Einkaufen
  {
    id: 'quest-1',
    type: 'quest',
    authorId: 'user-5',
    createdAt: subDays(new Date(), 2).toISOString(),
    title: 'Nachbarschaftshilfe: Einkaufen',
    content: '# Hilfe beim Einkaufen gesucht\n\nIch suche jemanden, der mir **einmal wöchentlich** beim Einkaufen helfen kann. Aufgrund meiner eingeschränkten Mobilität fällt mir das schwer.\n\n## Details\n- Jeden Donnerstag vormittag\n- Einkauf im nahegelegenen Supermarkt\n- Kleine Aufwandsentschädigung möglich\n\n## Was ich biete\n- 15€ pro Einsatz\n- Nette Gespräche bei einer Tasse Kaffee\n- Dankbarkeit und gute Gesellschaft',
    location: { lat: 52.516, lon: 13.396, name: 'Mitte, Berlin' },
    reactions: { '❤️': 12, '👍': 8 },
    comments: [
      { id: 'c-q1-1', authorId: 'user-2', text: 'Ich kann donnerstags helfen!', createdAt: subHours(new Date(), 3).toISOString(), replies: [] },
    ],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=500&q=80' }
    ],
    questDetails: {
      difficulty: 'Einfach',
      timeRequired: '1-2 Stunden',
      reward: '15€ pro Einsatz'
    }
  },

  // Quest 2: Garten-Hilfe
  {
    id: 'quest-2',
    type: 'quest',
    authorId: 'user-7',
    createdAt: subHours(new Date(), 12).toISOString(),
    title: 'Hilfe beim Umgraben des Gartens',
    content: '# Garten-Hilfe gesucht!\n\nIch brauche **kräftige Unterstützung** beim Umgraben meines Gemüsegartens. Die Arbeit ist körperlich anstrengend, aber zusammen schaffen wir das!\n\n## Was zu tun ist\n- Ca. 50m² umgraben\n- Unkraut entfernen\n- Kompost einarbeiten\n\n## Belohnung\n- Frisches Bio-Gemüse aus dem Garten\n- Gemeinsames Mittagessen\n- Garten-Know-how zum Mitnehmen',
    location: { lat: 52.509, lon: 13.393, name: 'Kreuzberg, Berlin' },
    reactions: { '💪': 5, '👍': 7 },
    comments: [],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=500&q=80' }
    ],
    questDetails: {
      difficulty: 'Mittel',
      timeRequired: '4-5 Stunden',
      reward: 'Bio-Gemüse + Mittagessen'
    }
  },

  // Enhanced Project with Crowdfunding
  {
    id: 'post-garden',
    type: 'project',
    authorId: 'user-2',
    createdAt: subDays(new Date(), 14).toISOString(),
    title: 'Community-Garten Projekt',
    content: '# Gemeinsam gärtnern in der Stadt\n\nWir bauen einen **Community Garden** auf! Unser Ziel ist es, einen Ort zu schaffen, wo Nachbarn zusammenkommen und gemeinsam Gemüse anbauen können.\n\n## Unsere Vision\n- Nachhaltiger Anbau von Bio-Gemüse\n- Bildungsangebote für Kinder\n- Stärkung der Nachbarschaft\n- Grüne Oase mitten in der Stadt\n\n## Was wir vorhaben\n- Hochbeete bauen\n- Bewässerungssystem installieren\n- Geräteschuppen errichten\n- Sitzgelegenheiten schaffen\n\n## Mach mit!\nWir treffen uns jeden Samstag um 10 Uhr am Garten.',
    members: ['user-1', 'user-2', 'user-3', 'user-6', 'user-10'],
    location: { lat: 52.518, lon: 13.398, name: 'Volkspark Friedrichshain, Berlin' },
    reactions: { '🌱': 52, '❤️': 38, '👍': 45 },
    comments: [
      { id: 'c-pg-1', authorId: 'user-4', text: 'Großartiges Projekt! Wann kann ich vorbeikommen?', createdAt: subDays(new Date(), 3).toISOString(), replies: [] },
      { id: 'c-pg-2', authorId: 'user-9', text: 'Ich bringe Saatgut mit!', createdAt: subDays(new Date(), 2).toISOString(), replies: [] },
    ],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1611843467160-25afb8df1074?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=500&q=80' }
    ],
    crowdfunding: {
      raised: 3250,
      goal: 5000,
      donors: 42,
      donations: [
        { amount: 50, donor: 'Anonymous', date: subDays(new Date(), 1).toISOString() },
        { amount: 100, donor: 'Maria K.', date: subDays(new Date(), 3).toISOString() },
        { amount: 25, donor: 'Peter S.', date: subDays(new Date(), 5).toISOString() },
        { amount: 200, donor: 'Green Berlin e.V.', date: subDays(new Date(), 7).toISOString() }
      ]
    }
  },

  // Enhanced Offer with detailed info
  {
    id: 'offer-webdesign',
    type: 'offer',
    authorId: 'user-8',
    createdAt: subDays(new Date(), 5).toISOString(),
    title: 'Webdesign Services für lokale Projekte',
    content: '# Professionelles Webdesign\n\nIch biete **maßgeschneiderte Webdesign-Lösungen** speziell für Community-Projekte und lokale Initiativen zu fairen Preisen.\n\n## Meine Services\n- Responsive Webdesign\n- Modern und barrierefrei\n- SEO-optimiert\n- Wartung und Support\n\n## Besonders geeignet für\n- Nachbarschaftsinitiativen\n- Community-Projekte\n- Kleine Vereine\n- Lokale Unternehmen\n\n## Warum ich?\n- 10 Jahre Erfahrung\n- Faire Preise für Community-Projekte\n- Persönlicher Support\n- Lokaler Ansprechpartner',
    location: { lat: 52.512, lon: 13.395, name: 'Friedrichshain, Berlin' },
    reactions: { '💻': 18, '👍': 22 },
    comments: [
      { id: 'c-ow-1', authorId: 'user-2', text: 'Perfekt! Können wir für unser Gartenprojekt sprechen?', createdAt: subDays(new Date(), 1).toISOString(), replies: [] },
    ],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&q=80' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=500&q=80' }
    ],
    contactInfo: { email: 'david@coding-berlin.de', website: 'https://coding-berlin.de' }
  },

  // Event 1: Yoga im Park (Tomorrow morning)
  {
    id: 'post-1',
    type: 'event',
    authorId: 'user-1',
    createdAt: subHours(new Date(), 2).toISOString(),
    title: 'Yoga im Park',
    content: 'Lasst uns gemeinsam den Tag mit einer entspannten Yoga-Session im Stadtpark beginnen. Bringt eure Matten mit!',
    startTime: set(addDays(new Date(), 1), { hours: 9, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 1), { hours: 10, minutes: 30, seconds: 0 }).toISOString(),
    location: { lat: 52.52, lon: 13.40, name: 'Stadtpark Mitte' },
    reactions: { '❤️': 15, '👍': 25 },
    comments: [
      { id: 'c-1', authorId: 'user-2', text: 'Tolle Idee! Bin dabei.', createdAt: subMinutes(new Date(), 90).toISOString(), replies: [] },
      { id: 'c-2', authorId: 'user-3', text: 'Ich auch!', createdAt: subMinutes(new Date(), 60).toISOString(), replies: [] },
    ],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=500&q=80' }
    ],
    eventDetails: {
      participants: [
        { id: 'user-2', name: 'Max Schmidt', status: 'confirmed' },
        { id: 'user-3', name: 'Julia Klein', status: 'confirmed' },
        { id: 'user-5', name: 'Sarah Fischer', status: 'invited' }
      ]
    }
  },

  // Event 2: Community Meeting (In 3 days, evening)
  {
    id: 'post-event-2',
    type: 'event',
    authorId: 'user-2',
    createdAt: subDays(new Date(), 1).toISOString(),
    title: 'Community Meeting',
    content: 'Monatliches Treffen der Nachbarschaft. Wir besprechen aktuelle Projekte und planen neue Aktivitäten.',
    startTime: set(addDays(new Date(), 3), { hours: 19, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 3), { hours: 21, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.515, lon: 13.405, name: 'Gemeinschaftsraum' },
    reactions: { '👍': 32 },
    comments: [],
    media: []
  },

  // Event 3: Nachbarschaftsfest (Next Saturday, all day)
  {
    id: 'post-event-3',
    type: 'event',
    authorId: 'user-4',
    createdAt: subDays(new Date(), 2).toISOString(),
    title: 'Nachbarschaftsfest',
    content: 'Großes Sommerfest mit Grill, Musik und Kinderprogramm. Jeder bringt etwas mit!',
    startTime: set(addDays(new Date(), 6), { hours: 14, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 6), { hours: 22, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.518, lon: 13.398, name: 'Hinterhof Müller Straße' },
    reactions: { '🎉': 45, '❤️': 28 },
    comments: [],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=500&q=80' }
    ]
  },

  // Event 4: Coding Workshop (Next week Tuesday)
  {
    id: 'post-event-4',
    type: 'event',
    authorId: 'user-8',
    createdAt: subDays(new Date(), 1).toISOString(),
    title: 'Coding Workshop für Anfänger',
    content: 'Einführung in JavaScript und Webentwicklung. Keine Vorkenntnisse nötig!',
    startTime: set(addDays(new Date(), 9), { hours: 18, minutes: 30, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 9), { hours: 21, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.512, lon: 13.395, name: 'CoWorking Space Berlin' },
    reactions: { '💻': 18, '👍': 12 },
    comments: [],
    media: []
  },

  // Event 5: Book Club (Tomorrow evening)
  {
    id: 'post-event-5',
    type: 'event',
    authorId: 'user-7',
    createdAt: subHours(new Date(), 5).toISOString(),
    title: 'Buchclub Treffen',
    content: 'Diesen Monat lesen wir "Der Schwarm" von Frank Schätzing. Neue Mitglieder willkommen!',
    startTime: set(addDays(new Date(), 1), { hours: 20, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 1), { hours: 22, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.508, lon: 13.392, name: 'Café Literatur' },
    reactions: { '📚': 8 },
    comments: [],
    media: []
  },

  // Event 6: Lauftreff (In 2 days, early morning)
  {
    id: 'post-event-6',
    type: 'event',
    authorId: 'user-6',
    createdAt: subDays(new Date(), 3).toISOString(),
    title: 'Lauftreff am Morgen',
    content: 'Gemeinsam joggen durch den Park. Tempo: gemütlich. Treffpunkt am Haupteingang.',
    startTime: set(addDays(new Date(), 2), { hours: 7, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 2), { hours: 8, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.52, lon: 13.40, name: 'Stadtpark Eingang Nord' },
    reactions: { '🏃': 12, '👍': 15 },
    comments: [],
    media: []
  },

  // Event 7: Flohmarkt (Next Sunday)
  {
    id: 'post-event-7',
    type: 'event',
    authorId: 'user-5',
    createdAt: subDays(new Date(), 2).toISOString(),
    title: 'Nachbarschaftsflohmarkt',
    content: 'Verkaufe gebrauchte Kleidung, Bücher und Haushaltswaren. Tauschen auch möglich!',
    startTime: set(addWeeks(new Date(), 1), { hours: 10, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addWeeks(new Date(), 1), { hours: 16, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.514, lon: 13.402, name: 'Schulhof Goethe-Schule' },
    reactions: { '🛍️': 22 },
    comments: [],
    media: []
  },

  // Event 8: Kino Abend (In 4 days)
  {
    id: 'post-event-8',
    type: 'event',
    authorId: 'user-9',
    createdAt: subHours(new Date(), 10).toISOString(),
    title: 'Open-Air Kino',
    content: 'Filmvorführung im Hinterhof. Heute: Klassiker der 80er Jahre. Decken mitbringen!',
    startTime: set(addDays(new Date(), 4), { hours: 21, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 4), { hours: 23, minutes: 30, seconds: 0 }).toISOString(),
    location: { lat: 52.516, lon: 13.408, name: 'Hinterhof Kastanienallee' },
    reactions: { '🎬': 28, '❤️': 19 },
    comments: [],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80' }
    ]
  },

  // Event 9: Repair Café (Next Wednesday afternoon)
  {
    id: 'post-event-9',
    type: 'event',
    authorId: 'user-10',
    createdAt: subDays(new Date(), 4).toISOString(),
    title: 'Repair Café',
    content: 'Repariere kaputte Geräte mit Hilfe unserer Experten. Elektronik, Textilien, Möbel - wir versuchen alles!',
    startTime: set(addDays(new Date(), 10), { hours: 15, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 10), { hours: 19, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.510, lon: 13.400, name: 'Werkstatt Müllerstraße' },
    reactions: { '🔧': 15, '♻️': 20 },
    comments: [],
    media: []
  },

  // Event 10: Spiel Nachmittag für Kinder (This Saturday)
  {
    id: 'post-event-10',
    type: 'event',
    authorId: 'user-3',
    createdAt: subHours(new Date(), 15).toISOString(),
    title: 'Spielnachmittag für Kinder',
    content: 'Brettspiele, Basteln und Spaß für Kinder zwischen 5 und 12 Jahren. Eltern dürfen gerne dabei bleiben!',
    startTime: set(addDays(new Date(), 5), { hours: 14, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 5), { hours: 17, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.513, lon: 13.397, name: 'Jugendclub Neukölln' },
    reactions: { '🎨': 25, '👶': 18 },
    comments: [],
    media: []
  },

  // Event 11: Fahrradtour (Next Sunday morning)
  {
    id: 'post-event-11',
    type: 'event',
    authorId: 'user-2',
    createdAt: subDays(new Date(), 5).toISOString(),
    title: 'Fahrradtour ans Wasser',
    content: 'Gemütliche 30km Tour zum See. Picknick am Ziel. Alle Levels willkommen!',
    startTime: set(addWeeks(new Date(), 1), { hours: 9, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addWeeks(new Date(), 1), { hours: 15, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.52, lon: 13.40, name: 'Stadtpark Treffpunkt' },
    reactions: { '🚴': 22, '☀️': 16 },
    comments: [],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=500&q=80' }
    ]
  },

  // Event 12: Sprachcafé (In 5 days)
  {
    id: 'post-event-12',
    type: 'event',
    authorId: 'user-1',
    createdAt: subDays(new Date(), 3).toISOString(),
    title: 'Internationales Sprachcafé',
    content: 'Übe Deutsch, Englisch, Spanisch oder andere Sprachen in entspannter Atmosphäre.',
    startTime: set(addDays(new Date(), 5), { hours: 18, minutes: 0, seconds: 0 }).toISOString(),
    endTime: set(addDays(new Date(), 5), { hours: 21, minutes: 0, seconds: 0 }).toISOString(),
    location: { lat: 52.511, lon: 13.394, name: 'Café International' },
    reactions: { '🌍': 14, '💬': 11 },
    comments: [],
    media: []
  },

  // Project post (not an event)
  {
    id: 'post-2',
    type: 'project',
    authorId: 'user-2',
    createdAt: subDays(new Date(), 1).toISOString(),
    title: 'Community-Garten anlegen',
    content: 'Wir suchen Helfer, um ein neues Beet für unseren Gemeinschaftsgarten anzulegen. Werkzeug ist vorhanden, gute Laune bitte mitbringen!',
    members: ['user-1', 'user-2', 'user-3'],
    location: { lat: 52.51, lon: 13.41, name: 'Nachbarschaftsgarten' },
    reactions: { '👍': 42, '🌱': 18 },
    comments: [],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=500&q=80' }
    ]
  },

  // Offer post (not an event)
  {
    id: 'post-3',
    type: 'offer',
    authorId: 'user-3',
    createdAt: subDays(new Date(), 3).toISOString(),
    title: 'Biete Bohrmaschine zum Verleih',
    content: 'Habe eine kaum benutzte Schlagbohrmaschine, die ich gerne an Nachbarn verleihe. Einfach melden!',
    reactions: { '❤️': 5 },
    comments: [],
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=500&q=80' }
    ]
  },
];

export const initializeMockData = () => {
  if (!localStorage.getItem('users')) {
    localStorage.setItem('users', JSON.stringify(mockUsers));
  }
  if (!localStorage.getItem('posts')) {
    localStorage.setItem('posts', JSON.stringify(mockPosts));
  }
  // Initialize notifications
  initializeNotifications();
  // Initialize messages
  initializeMessages();
};

export { mockUsers };