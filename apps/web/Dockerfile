FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w @netverse/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
