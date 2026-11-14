FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY frontend frontend
COPY shared shared
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/frontend/dist frontend/dist
COPY backend/src backend/src
COPY shared shared
COPY database database
USER node
EXPOSE 3001
CMD ["npm", "start"]
