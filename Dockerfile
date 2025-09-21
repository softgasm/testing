# Container Configuration
# This is a template for container configuration
# Replace this with your actual container configuration

# Example Dockerfile:
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
