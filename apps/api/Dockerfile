# HireLens API — multi-stage build for the self-host stack.
# Scope note: workspace packages export TypeScript source directly, so
# the server runs under tsx (Node 22 type stripping + transpile). The
# typecheck runs in CI; the image stays simple and self-contained.

# ---- 1. Shared base: node + pnpm -------------------------------
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

# ---- 4. Prune to the API's production dependency graph -----------
# pnpm deploy writes a self-contained node_modules (workspace packages
# included) into /out — no devDependencies, no install-time scripts.
FROM install AS deploy
RUN pnpm --filter=@hirelens/api --prod deploy --legacy /out

# ---- 5. Runtime: /out + the app's source ------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=deploy /out ./
COPY --from=install /app/apps/api/src ./src
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT??4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Boot: apply pending migrations (run through the deployed @hirelens/db
# package so its own node_modules resolves pg/drizzle), then serve.
CMD ["sh", "-c", "node_modules/.bin/tsx node_modules/@hirelens/db/src/migrate.ts && node_modules/.bin/tsx src/main.ts"]
