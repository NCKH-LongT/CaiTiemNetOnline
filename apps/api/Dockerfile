FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "apps/api/src/index.mjs"]
