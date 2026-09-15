FROM node:22-alpine AS api-build

WORKDIR /app

COPY api/package*.json ./
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build


FROM node:22-alpine AS api-runtime

WORKDIR /app

ENV NODE_ENV=production

COPY api/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=api-build /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "dist/server.js"]
