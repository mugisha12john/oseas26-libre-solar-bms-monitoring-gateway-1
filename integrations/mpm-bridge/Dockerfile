FROM node:22-bookworm-slim

WORKDIR /app/mpm-bridge
COPY integrations/mpm-bridge/package.json integrations/mpm-bridge/package-lock.json ./
RUN npm ci
COPY integrations/mpm-bridge/tsconfig.json ./
COPY integrations/mpm-bridge/src ./src
RUN npm run build

CMD ["npm", "run", "start"]
