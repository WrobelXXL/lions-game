# Lions-Game (Galgenmaennchen Multiplayer) - Node.js-Server mit WebSockets
FROM node:22-alpine

WORKDIR /app

# Erst nur die Paketdateien kopieren -> Docker-Cache fuer "npm ci"
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Restlichen Code kopieren
COPY server.js words.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Nicht als root laufen
USER node

CMD ["node", "server.js"]
