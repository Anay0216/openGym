# Stage 1: Build the frontend (React 19 + Vite)
FROM node:22-alpine AS build

WORKDIR /app

# Install frontend dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm ci --ignore-scripts

# Copy code needed for frontend build
COPY api/coach/core/ ./api/coach/core/
COPY frontend/ ./frontend/

# Build static bundle
RUN cd frontend && npm run build

# Stage 2: Runtime image
FROM node:22-alpine

WORKDIR /app

# Upgrade base packages
RUN apk upgrade --no-cache

# Install backend dependencies
COPY api/package.json api/package-lock.json* ./api/
RUN cd api && npm ci --omit=dev --omit=optional && npm cache clean --force

# Copy backend files, media, and built frontend
COPY api/ ./api/
COPY catalogue/media/ ./catalogue/media/
COPY --from=build /app/frontend/dist/ ./frontend/dist/
COPY run-local.mjs ./

# Set environment defaults
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV ALLOW_GUEST=1
ENV PASSWORD_LOGIN=1
ENV FIRST_USER_ADMIN=1
ENV PORT=8080

EXPOSE 8080

CMD ["node", "run-local.mjs"]
