# Base image
FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Install pnpm (misma versión que generó el lockfile)
RUN npm install -g pnpm@11.5.0

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Expose the application port
EXPOSE 3000

# Start the application in production mode
CMD ["sh", "-c", "pnpm run migration:run:prod && pnpm run start:prod"]
