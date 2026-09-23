FROM node:24-alpine AS build

RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --filter web

COPY apps/web apps/web
RUN pnpm --filter web build

FROM node:24-alpine

WORKDIR /app
COPY --from=build /repo/apps/web/.output ./.output

ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
