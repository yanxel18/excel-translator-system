FROM node:18-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache python3 py3-pip

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy project files
COPY . .

EXPOSE 3000 5173

CMD ["npm", "run", "dev"]