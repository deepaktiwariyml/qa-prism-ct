# QA Prism API (Fastify + BullMQ worker + Playwright/Lighthouse scanners).
# Node 20 + Chromium (installed via Playwright, reused by Lighthouse).
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

# Whole monorepo (pnpm workspace install needs every package manifest).
COPY . .

# Install all workspace deps, then the Chromium browser + its system libraries.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qa-prism/api exec playwright install --with-deps chromium

# Build the API and everything it depends on (turbo resolves the order; the db
# package's build runs `prisma generate`).
RUN pnpm turbo build --filter=@qa-prism/api...

EXPOSE 3001
# Apply pending migrations (idempotent), then start the API + worker.
CMD ["sh", "-c", "pnpm --filter @qa-prism/db exec prisma migrate deploy && node apps/api/dist/index.js"]
