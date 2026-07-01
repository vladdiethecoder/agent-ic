# Agent IC production image foundation.
# This is a hardened baseline, not a complete compliance-certified deployment.
FROM node:24-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:local

FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 agentic \
  && useradd --system --uid 1001 --gid agentic --home /app --shell /usr/sbin/nologin agentic

COPY --from=builder --chown=agentic:agentic /app/.next ./.next
COPY --from=builder --chown=agentic:agentic /app/public ./public
COPY --from=builder --chown=agentic:agentic /app/package.json ./package.json
COPY --from=builder --chown=agentic:agentic /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=agentic:agentic /app/node_modules ./node_modules
COPY --from=builder --chown=agentic:agentic /app/app ./app
COPY --from=builder --chown=agentic:agentic /app/components ./components
COPY --from=builder --chown=agentic:agentic /app/lib ./lib
COPY --from=builder --chown=agentic:agentic /app/scripts ./scripts
COPY --from=builder --chown=agentic:agentic /app/next.config.mjs ./next.config.mjs

USER agentic
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "run", "start:local"]
