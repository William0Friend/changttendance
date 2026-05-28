FROM node:20-bullseye-slim

# Install system deps commonly needed by Playwright browsers
RUN apt-get update && apt-get install -y \
  ca-certificates wget gnupg \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libgbm1 libasound2 libx11-xcb1 libxcb-dri3-0 libxrandr2 libxss1 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy package files first to leverage Docker cache for dependency install
COPY package.json package-lock.json ./

# Install all dependencies (including dev dependencies like Playwright)
RUN npm ci

# Install Playwright browsers and OS deps
RUN npx playwright install --with-deps || npx playwright install

# Copy project files
COPY . .

ENV CI=1

# Default command runs E2E tests (build + preview + playwright run defined in playwright.config)
CMD ["npm", "run", "test:e2e"]
