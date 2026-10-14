FROM node:22-bookworm-slim

WORKDIR /app/simulator
COPY simulator/package.json simulator/package-lock.json ./
RUN npm ci
COPY simulator/tsconfig.json ./
COPY simulator/src ./src
COPY simulator/tests ./tests
COPY schemas /app/schemas
RUN npm run build

CMD ["npm", "run", "start"]

