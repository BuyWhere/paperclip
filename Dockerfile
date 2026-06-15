FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Skip postinstall (prisma generate) — schema not yet available at this stage
RUN npm ci --legacy-peer-deps --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Placeholder values — real values injected at runtime via Railway env vars
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV JWT_PRIVATE_KEY="placeholder"
ENV JWT_PUBLIC_KEY="placeholder"

# Generate Prisma client then build Next.js
# output: 'standalone' is set in next.config.js for optimal image size
RUN npx prisma generate --schema=./prisma/schema.prisma && npx next build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install postgresql-client for migration support
RUN apk add --no-cache postgresql-client

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy the standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy Prisma runtime files needed at startup
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

COPY --chown=nextjs:nodejs scripts/railway-start.sh ./railway-start.sh
RUN chmod +x ./railway-start.sh

USER nextjs
EXPOSE 3000

CMD ["./railway-start.sh"]
