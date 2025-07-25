FROM ubuntu:20.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    qbittorrent-nox \
    python3-pip \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Install AWS CLI
RUN pip3 install awscli

# Create app directory
WORKDIR /app

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy all service files
COPY . .

# Make scripts executable
RUN chmod +x download_and_upload.sh entrypoint.sh

# Create directories with proper permissions
RUN mkdir -p /mnt/data /home/appuser/.cache/qBittorrent /home/appuser/.config/qBittorrent && \
    useradd -u 1000 -m appuser && \
    chown -R appuser:appuser /mnt/data /app /home/appuser

# Expose ports
EXPOSE 8080 8081 6881 6881/udp

# Set environment variable to auto-start download
ENV AUTO_START=true

# Run as non-root user
USER appuser

# Start the service
CMD ["./entrypoint.sh"]