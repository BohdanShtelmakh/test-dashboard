FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

# Keep workspace resolution and the API's patch-package install hook intact.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/patches ./apps/api/patches
RUN npm ci --workspace @test-dashboard/api --include-workspace-root=false \
    && npm run postinstall --workspace @test-dashboard/api

FROM dependencies AS build
COPY apps/api ./apps/api
RUN npm run build --workspace @test-dashboard/api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/patches ./apps/api/patches
RUN npm ci --omit=dev --workspace @test-dashboard/api --include-workspace-root=false \
    && npm run postinstall --workspace @test-dashboard/api \
    && npm cache clean --force
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
