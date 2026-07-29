# ValueProof Valuation Suite — API service image.
# Runs the composition-root server on Node's native TypeScript support (no build
# step). The only npm dependency is the `pg` driver, installed from the root
# package.json so it resolves from packages/persistence/src/pgClient.ts.

FROM node:24-alpine

WORKDIR /app

# Install only the production dependency (pg). Layer caches on package.json.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source (TypeScript run directly by Node ≥ 23).
COPY packages ./packages
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Liveness: hit the public health endpoint.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run as the non-root user the base image provides.
USER node

CMD ["node", "packages/server/src/main.ts"]
