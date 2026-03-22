# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json ./
COPY package-lock.json* ./

# Use ci for reproducible builds when lockfile is present, install otherwise
RUN if [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

COPY . .

# Ensure no stale dist from host bleeds in
RUN rm -rf /app/dist

# Fail loudly if build fails — makes black-screen debugging easier
RUN npm run build 2>&1 | tee /tmp/build.log && \
    test -f /app/dist/index.html || (echo "ERROR: dist/index.html missing" && cat /tmp/build.log && exit 1) && \
    echo "=== Built dist/ contents ===" && ls -lh /app/dist/ && ls -lh /app/dist/assets/ 2>/dev/null || true && \
    grep -q "assets/" /app/dist/index.html || (echo "ERROR: built index.html missing asset refs - Vite likely failed" && cat /app/dist/index.html && exit 1)

# ── Serve stage (nginx) ────────────────────────────────────────────────────────
FROM nginx:alpine

# Install curl for reliable healthcheck (wget in busybox alpine has flag quirks)
RUN apk add --no-cache curl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

# Healthcheck — curl is more reliable than busybox wget in alpine
HEALTHCHECK --interval=10s --timeout=5s --retries=6 --start-period=15s \
  CMD curl -sf http://localhost/ > /dev/null || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
