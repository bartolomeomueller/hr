FROM node:25-trixie-slim AS build

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install -g corepack --force && corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm run build

# Remove dev dependencies
RUN pnpm prune --prod


FROM node:25-trixie-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Safer than copying ffmpeg
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules /app/node_modules

COPY --from=build /app/dist /app/dist

CMD ["node", "dist/main.js"]
