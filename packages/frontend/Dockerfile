# syntax=docker/dockerfile:1

# Build context is the repository root. Build with:
#   docker build -f packages/frontend/Dockerfile -t flash-sale-frontend .

# Stage 1: produce the static production bundle.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm ci --include=dev
COPY packages/frontend ./packages/frontend
RUN npm run build --workspace @flash-sale/frontend

# Stage 2: serve the bundle with nginx and reverse-proxy /api to the backend.
FROM nginx:1.27-alpine AS runtime
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
EXPOSE 8080
