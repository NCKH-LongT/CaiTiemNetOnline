FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/game-server/package.json apps/game-server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/voice-server/package.json apps/voice-server/package.json
RUN npm ci --omit=dev --workspace=@netverse/voice-server --include-workspace-root=false
COPY apps/voice-server/src apps/voice-server/src
ENV NODE_ENV=production PORT=2570
EXPOSE 2570
CMD ["node", "apps/voice-server/src/index.mjs"]
