# ---- Stage 1: Build the frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ---- Stage 2: Backend runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src
# Copy the built frontend (served statically by Express)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Persistable directories (SQLite DB, uploads, trained OCR data)
RUN mkdir -p /app/data /app/uploads && \
    chown -R node:node /app
VOLUME ["/app/data", "/app/uploads"]

# Local Tesseract language data is bundled at build time if present
COPY backend/data ./data

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1

CMD ["node", "src/server.js"]
