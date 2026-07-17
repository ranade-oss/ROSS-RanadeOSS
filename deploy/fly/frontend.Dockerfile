FROM node:22-bookworm-slim AS dependencies

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_ROSS_APP_URL
ARG NEXT_PUBLIC_ROSS_WEBSITE_URL
ARG NEXT_PUBLIC_ROSS_HOSTED_MODE=controlled-beta
ARG NEXT_PUBLIC_ROSS_DATA_BOUNDARY_VERSION=2026-07-16
ARG NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=false

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY} \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_ROSS_APP_URL=${NEXT_PUBLIC_ROSS_APP_URL} \
    NEXT_PUBLIC_ROSS_WEBSITE_URL=${NEXT_PUBLIC_ROSS_WEBSITE_URL} \
    NEXT_PUBLIC_ROSS_HOSTED_MODE=${NEXT_PUBLIC_ROSS_HOSTED_MODE} \
    NEXT_PUBLIC_ROSS_DATA_BOUNDARY_VERSION=${NEXT_PUBLIC_ROSS_DATA_BOUNDARY_VERSION} \
    NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=${NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED}

WORKDIR /app
COPY --from=dependencies /app/frontend/node_modules ./frontend/node_modules
COPY config ./config
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app/frontend
COPY --from=build --chown=node:node /app/frontend/public ./public
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./standalone
COPY --from=build --chown=node:node /app/frontend/.next/static ./standalone/frontend/.next/static

WORKDIR /app/frontend/standalone/frontend
EXPOSE 3000
USER node
CMD ["node", "server.js"]

