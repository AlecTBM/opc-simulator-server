FROM nodered/node-red:latest

USER root
RUN cd /data && npm install --omit=dev --no-audit --no-fund \
    @flowfuse/node-red-dashboard \
    node-red-contrib-opcua
USER node-red
