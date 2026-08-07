# TaskFlow backend — production image (used by Fly.io or any container host).
#
# Build context must be the monorepo root (taskflow/) so npm workspaces and
# the shared lockfile are available:
#
#   docker build -f Dockerfile -t taskflow-api .
#   docker run --rm -p 3001:3001 \
#     -e MONGODB_URI=... -e JWT_ACCESS_SECRET=... -e JWT_REFRESH_SECRET=... \
#     -e CORS_ORIGIN=https://taskflow.vercel.app \
#     taskflow-api
#
# Fly.io alternative: `fly launch` with this Dockerfile at taskflow/ and the
# same env vars set via `fly secrets set`.

FROM node:22-alpine AS build
WORKDIR /app

# Install workspace dependencies first (layers cache well).
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci

# Copy and compile the backend only.
COPY backend ./backend
RUN npm run build --workspace backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy hoisted node_modules + compiled output + workspace manifests.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json

WORKDIR /app/backend
EXPOSE 3001
CMD ["node", "dist/main.js"]
