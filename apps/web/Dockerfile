FROM node:24-alpine AS build

RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --filter web

COPY apps/web apps/web
COPY packages/schema packages/schema
RUN pnpm --filter web build && pnpm --filter web build:migrate

FROM node:24-alpine

WORKDIR /app
COPY --from=build /repo/apps/web/.output ./.output
# Self-contained migration runner and the committed migrations (006):
# `node migrate.mjs` is Fly's release_command and Compose's migrate service.
COPY --from=build /repo/apps/web/dist/migrate.mjs ./migrate.mjs
COPY --from=build /repo/apps/web/drizzle ./drizzle

ENV PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
