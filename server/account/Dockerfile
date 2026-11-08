# TusAnkiM hesap sunucusu. Bağımlılığı yok: Node 24'ün kendi TypeScript desteğiyle çalışır.
# Depo kökünden derleyin:  docker build -f server/account/Dockerfile -t tusankim-account .
FROM node:24-alpine

ENV NODE_ENV=production \
    ACCOUNT_HOST=0.0.0.0 \
    ACCOUNT_PORT=8787 \
    ACCOUNT_DATABASE=/data/accounts.sqlite

WORKDIR /app
# Sunucu, ortak sözleşmeyi ../../lib yolundan okur; aynı düzen korunur.
COPY lib/accountContract.ts lib/accountContract.ts
COPY server/account/*.ts server/account/
RUN rm -f server/account/*.test.ts server/account/testing.ts \
    && mkdir -p /data \
    && chown node:node /data

USER node
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.ACCOUNT_PORT || 8787) + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "server/account/main.ts"]
