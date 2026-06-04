FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /data
ENV PORT=7860 DATA_DIR=/data
EXPOSE 7860
CMD ["node", "index.js"]
