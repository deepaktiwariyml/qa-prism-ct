# QA Prism dashboard (Next.js). Talks only to the API over the internal network.
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
# Build the web app and its workspace deps.
RUN pnpm turbo build --filter=@qa-prism/web...

EXPOSE 3000
# Runtime env (APP_PASSWORD, API_INTERNAL_URL, …) is injected by compose.
CMD ["pnpm", "--filter", "@qa-prism/web", "exec", "next", "start", "-p", "3000"]
