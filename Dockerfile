# ==============================================================================
# Multi-Stage Production Dockerfile for Zen Work Logs (Pure React SPA + Supabase)
# ==============================================================================

# Stage 1: Build React Frontend
FROM node:22-alpine AS builder

WORKDIR /app/client

COPY client/package.json client/package-lock.json* ./
RUN npm install && npm install --no-save @rollup/rollup-linux-x64-musl

# Mandatory Build-Time Environment Variables (injected by Coolify)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" || (echo "ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY build args are required" && exit 1)

COPY client/ ./
RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine

RUN apk add --no-cache curl wget && rm -rf /usr/share/nginx/html/*

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 3000 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fs http://127.0.0.1:3000/healthz || wget -q -O - http://127.0.0.1:3000/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
