FROM node:22-alpine AS base

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE=
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

COPY . .
RUN npm run build && ls -la .next

FROM deps AS prod-deps

RUN npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

ARG NEXT_PUBLIC_API_BASE=
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

CMD ["npm", "start"]

FROM nginx:1.27-alpine AS nginx

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/.next /usr/share/nginx/html/_next
# `public` may be absent in some projects; static files are served from .next/static

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]