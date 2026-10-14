FROM node:22-bookworm-slim

WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/tsconfig.json ./
COPY dashboard/src ./src
COPY dashboard/public ./public
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
