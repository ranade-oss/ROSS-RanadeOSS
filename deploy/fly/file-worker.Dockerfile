FROM node:22-bookworm-slim AS build

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        clamav \
        clamav-freshclam \
        fonts-liberation \
        libreoffice-calc \
        libreoffice-impress \
        libreoffice-writer \
    && freshclam --stdout \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist

EXPOSE 3002
CMD ["sh", "-c", "freshclam --stdout && exec su node -s /bin/sh -c 'exec node dist/fileWorker.js'"]
