FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
CMD ["node", "apps/game-server/src/index.mjs"]
