# HireLens Web — multi-stage build for the self-host stack.
# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time,
# so they are build args here (override: docker build --build-arg).

# ---- 1. Shared base --------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- 2. Fetch all workspace dependencies ------------------------
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# ---- 3. Install with the real workspace layout ------------------
FROM fetch AS install
ENV HUSKY=0
COPY . .
RUN pnpm install --frozen-lockfile --offline

# ---- 4. Build the standalone Next.js server ----------------------
# (@hirelens/core now exports its compiled dist/, so the core build must
# run before the Next build — turbo handles the dependency order.)
FROM install AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_AUTH_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_BASE_URL=$NEXT_PUBLIC_AUTH_BASE_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN ./node_modules/.bin/turbo run build --filter=@hirelens/web --concurrency=4

# ---- 5. Runtime: the standalone bundle only -----------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# standalone already contains server.js + the pruned node_modules
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# runtime cache dir for ISR/dynamic rendering
RUN mkdir -p apps/web/.next/cache && chown -R node:node /app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT??3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "apps/web/server.js"]
