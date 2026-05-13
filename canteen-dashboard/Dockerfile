FROM node:20-alpine

# sqlite3 needs python3 + make + g++ to compile native bindings on Linux
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install ROOT-level (frontend) deps (needed only at build time, kept minimal)
COPY package*.json ./
RUN npm install --omit=dev

# Install SERVER deps inside the container so native modules compile for Linux
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev && npm rebuild sqlite3 --build-from-source

# Copy server source (node_modules excluded via .dockerignore)
COPY server/ ./server/

# Copy pre-built Vite frontend
COPY dist/ ./dist/

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
