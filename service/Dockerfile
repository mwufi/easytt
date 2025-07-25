FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache \
    aria2 \
    bash \
    aws-cli


# Create app directory
WORKDIR /app

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy all service files
COPY . .

# Make scripts executable
RUN chmod +x upload-to-s3.sh

# Create downloads directory
RUN mkdir -p /downloads && chmod 777 /downloads

# Expose API port
EXPOSE 3000

# Start the service
CMD ["node", "app.js"]