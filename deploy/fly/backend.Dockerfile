FROM node:22-bookworm-slim AS build

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ARG ROSS_BUILD_RELEASE_ID
ENV NODE_ENV=production \
    ROSS_BUILD_RELEASE_ID=${ROSS_BUILD_RELEASE_ID}
WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-liberation \
        libreoffice-calc \
        libreoffice-impress \
        libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist

EXPOSE 3001
USER node
CMD ["node", "dist/index.js"]
