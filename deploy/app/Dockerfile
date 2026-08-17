# Reference-App als Instanz-Artefakt.
#
# EIN Image, viele Instanzen: Endpunkte und Branding kommen zur Laufzeit aus
# config.json (Spec 11), nicht aus dem Build. Einkompiliert wird nur der
# Basispfad — er steckt in jeder Asset-URL und ist Teil des Auslieferungs-
# Layouts, nicht der Instanz-Identitaet.

# ---------- Build ----------
FROM node:22-alpine AS build
WORKDIR /src

RUN corepack enable

# Nur die Manifeste zuerst — so bleibt die Dependency-Schicht im Cache,
# solange sich keine Abhaengigkeit aendert.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/data-interface/package.json packages/data-interface/
COPY packages/toolkit/package.json packages/toolkit/
COPY packages/wot-connector/package.json packages/wot-connector/
COPY packages/local-connector/package.json packages/local-connector/
COPY packages/mock-connector/package.json packages/mock-connector/
COPY packages/supabase-connector/package.json packages/supabase-connector/
COPY packages/graphql-connector/package.json packages/graphql-connector/
COPY apps/reference/package.json apps/reference/
RUN pnpm install --frozen-lockfile --filter reference...

COPY . .

# Die App liegt unter /app, die Landingpage der Instanz auf /.
ARG BASE_PATH=/app
ENV VITE_BASE_PATH=${BASE_PATH}
RUN pnpm --filter reference... build

# ---------- Laufzeit ----------
FROM nginx:1.27-alpine

COPY --from=build /src/apps/reference/dist /usr/share/nginx/html/app
COPY deploy/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/app/entrypoint.sh /docker-entrypoint.d/40-rls-config.sh
COPY deploy/app/landing-default/ /srv/landing-default/

# Beide Verzeichnisse sind Mountpunkte fuer den Betreiber. Ohne Mount greift
# fuer die Landingpage die mitgelieferte Platzhalterseite; Branding ist dann
# schlicht leer, und die App laeuft mit ihren Standardwerten.
RUN mkdir -p /srv/landing /srv/branding \
 && cp -r /srv/landing-default/. /srv/landing/ \
 && chmod +x /docker-entrypoint.d/40-rls-config.sh

EXPOSE 80
