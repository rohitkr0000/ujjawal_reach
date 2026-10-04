# Build from the repository root:  docker build -f apps/api/Dockerfile -t ujjwal-api .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/schemes/package.json packages/schemes/
RUN npm ci
COPY packages packages
COPY apps/api apps/api
RUN npm run build -w @ujjwal/api

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/schemes/package.json packages/schemes/
RUN npm ci --omit=dev -w @ujjwal/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY data data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
