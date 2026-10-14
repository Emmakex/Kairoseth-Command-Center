FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --no-frozen-lockfile

COPY apps/web apps/web
COPY packages/ui packages/ui

RUN pnpm --filter @kcc/web... build

EXPOSE 3000
CMD ["pnpm", "--filter", "@kcc/web", "start"]
