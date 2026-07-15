# syntax=docker/dockerfile:1

# Build context is the repository root so the npm workspace graph and the
# lockfile resolve correctly. Build with:
#   docker build -f packages/backend/Dockerfile -t flash-sale-backend .

# Stage 1: compile TypeScript to JavaScript (needs dev dependencies).
FROM node:20-alpine AS build
WORKDIR /app
# Copy manifests first so dependency install is cached across source changes.
# Both workspace manifests are needed for npm ci to match the root lockfile.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm ci --include=dev
COPY packages/backend ./packages/backend
RUN npm run build --workspace @flash-sale/backend

# Stage 2: lean runtime image with production dependencies only, non-root.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
USER node
EXPOSE 3000
# Liveness against the app's own /health route using Node's built-in fetch.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/dist/index.js"]
