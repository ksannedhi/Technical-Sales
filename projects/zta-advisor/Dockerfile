FROM node:20-slim

# System libraries required by Puppeteer's bundled Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libgbm1 libasound2 libpangocairo-1.0-0 libxss1 \
    libgtk-3-0 libxshmfence1 libxrandr2 libxcomposite1 \
    libxdamage1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend — install deps (cached layer, only re-runs if package.json changes)
COPY backend/package*.json ./backend/
RUN npm ci --prefix backend

# Frontend — install deps + build (cached layer)
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend/ ./frontend/
RUN npm run build --prefix frontend

# Backend source (after frontend build so source changes don't bust frontend cache)
COPY backend/ ./backend/

ENV NODE_ENV=production

EXPOSE 3005

CMD ["node", "backend/server.js"]
