FROM node:25.8.1-trixie-slim
WORKDIR /app

RUN apt update && apt install -y ffmpeg && rm -rf /var/cache/apt/*

COPY package.json .
COPY pnpm-lock.yaml .
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY src src
COPY tsconfig.json .

RUN pnpm run build
EXPOSE 3001
CMD ["pnpm", "start"]
