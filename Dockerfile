# Multi-stage Dockerfile for Coolify deployment

# Stage 1: Build React frontend
FROM node:18-alpine AS build

WORKDIR /app/client

# Force install all dependencies (including devDependencies) regardless of NODE_ENV
COPY client/package.json ./
RUN npm install --include=dev

COPY client/ ./
# Force build to run in development mode to ensure dev tools are available
RUN NODE_ENV=development npm run build

# Stage 2: Production server with pre-built frontend
FROM node:18-alpine

WORKDIR /app

# Install Python and build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy server files (package.json is in root)
COPY package.json ./
COPY server/server.js ./server.js
COPY server/database.js ./database.js
COPY server/parser.js ./parser.js
COPY server/routes ./routes
COPY server/routes/files.js ./routes/files.js

# Install server dependencies
RUN npm install --production

# Copy built frontend from build stage
COPY --from=build /app/client/dist ./client/dist

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if(r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["node", "server.js"]
