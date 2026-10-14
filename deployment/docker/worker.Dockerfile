FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --no-frozen-lockfile

COPY apps/worker apps/worker
COPY packages/config packages/config

RUN pnpm --filter @kcc/worker... build

CMD ["pnpm", "--filter", "@kcc/worker", "start"]
