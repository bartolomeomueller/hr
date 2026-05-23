FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# tmp fixes because of vite config ignore
RUN cp -R node_modules/bullmq/dist/cjs .output/server/node_modules/bullmq/dist/
RUN cp -R node_modules/.pnpm/uuid@11.1.0/node_modules/uuid/dist/cjs .output/server/node_modules/uuid/dist/
RUN cp -R node_modules/.pnpm/msgpackr@1.11.5/node_modules/msgpackr/dist .output/server/node_modules/msgpackr/

FROM node:22-alpine AS runtime

WORKDIR /app

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
