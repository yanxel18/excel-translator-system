FROM node:18-alpine

WORKDIR /app

# Install Python and pip for orchestrator
RUN apk add --no-cache python3 py3-pip

# Copy package files
COPY package*.json ./
RUN npm install

# Copy development files
COPY . .

EXPOSE 3000 5173

CMD ["npm", "run", "dev"]