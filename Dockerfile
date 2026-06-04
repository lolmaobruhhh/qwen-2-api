# ── Build stage: clone and compile better-sqlite3 native addon ──
FROM node:20-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone your updated repository
RUN git clone https://github.com/Sexlovr/qwen-2-api.git .

# Install dependencies
RUN npm install --omit=dev

# ── Runtime stage: lean image ──
FROM node:20-slim

RUN mkdir -p /data
RUN chown -R 1000:1000 /data

WORKDIR /app
COPY --from=builder --chown=1000:1000 /app ./

USER 1000

ENV PORT=7860
ENV DATA_DIR=/data
ENV ADMIN_PASSWORD=admin
ENV JWT_SECRET=""
ENV CONV_TIMEOUT_MINUTES=60
ENV CLEANUP_HOURS=24
ENV DEBUG=1

EXPOSE 7860

CMD ["node", "index.js"]
