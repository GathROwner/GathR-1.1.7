FROM node:18-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --production

COPY . .

# Explicitly verify public/fallbacks is copied
RUN ls -la public/fallbacks/ || echo "WARNING: public/fallbacks not found"

EXPOSE 8080

CMD ["node", "server.js"]
