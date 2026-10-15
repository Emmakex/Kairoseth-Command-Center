FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/persistence/package.json packages/persistence/package.json
RUN pnpm install --no-frozen-lockfile

COPY apps/api apps/api
COPY packages/auth packages/auth
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
COPY packages/integrations packages/integrations
COPY packages/persistence packages/persistence

RUN pnpm --filter @kcc/api... build

EXPOSE 4000
CMD ["pnpm", "--filter", "@kcc/api", "start"]
