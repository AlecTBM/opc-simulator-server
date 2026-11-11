FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4840

CMD ["npm", "run", "dev"]
