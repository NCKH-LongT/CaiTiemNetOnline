FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/game-server/package.json apps/game-server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "apps/api/src/index.mjs"]
