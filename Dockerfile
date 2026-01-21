# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Use npm install if package-lock.json doesn't exist, otherwise npm ci
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Use npm install if package-lock.json doesn't exist, otherwise npm ci
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/index.js"]
