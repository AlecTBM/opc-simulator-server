FROM nodered/node-red:latest

COPY --chown=node-red:root nodered/package.json /data/package.json
RUN cd /data && npm install --omit=dev --no-audit --no-fund

COPY --chown=node-red:root nodered/settings.js /data/settings.js

USER node-red
