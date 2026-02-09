FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 4201

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4201

# Install production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source and build
COPY . .
RUN npm run build

# Prisma generate + migrate + start custom server
CMD ["npm", "run", "docker-start"]
