# Deployment Guide

## Overview

This guide covers deploying My Agent in various environments: local development, production servers, and cloud platforms.

## Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- OpenRouter API key
- (Optional) Telegram bot token
- (Optional) Google OAuth credentials for Drive integration

## Local Development

### Quick Start

```bash
# Clone and install
git clone <repository-url>
cd my_agent
npm install

# Configure environment
cp .env.example .env
nano .env

# Start development server
npm run dev
```

### Development with Watch Mode

```bash
# Auto-restart on file changes
npm run dev:watch
```

### Development with Telegram

```bash
# Run CLI + Telegram bot simultaneously
npm run dev:telegram
```

## Production Build

### Build TypeScript

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Start Production Server

```bash
npm start
```

### Production with Telegram

```bash
npm run start:telegram
```

## Environment Configuration

### Required Variables

```env
OPENROUTER_API_KEY=your_openrouter_api_key
MODEL=qwen/qwen3-8b
```

### Optional Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# API Server
API_PORT=3000

# Data Directory
DATA_DIR=/var/data/my-agent

# Google Drive Integration
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REFRESH_TOKEN=your_refresh_token
DRIVE_FOLDER_ID=your_folder_id
DRIVE_PUBLIC=1

# Alternative Model Providers
XIAOMI_API_KEY=your_xiaomi_key
XIAOMI_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
XIAOMI_MODEL=your_model_name

OPENAI_COMPAT_API_KEY=your_key
OPENAI_COMPAT_BASE_URL=your_base_url
OPENAI_COMPAT_MODEL=your_model

# Performance
MAX_OUTPUT_TOKENS=4096
CONTEXT_COMPRESSION=0

# Security
CORS_ORIGINS=https://your-domain.com
```

## Deployment Options

### 1. PM2 (Process Manager)

PM2 is recommended for production deployments:

```bash
# Install PM2 globally
npm install -g pm2

# Build the project
npm run build

# Start with PM2
pm2 start dist/index.js --name my-agent

# Or start with Telegram
pm2 start dist/index.js --name my-agent -- --telegram

# Save PM2 configuration
pm2 save

# Set up startup script
pm2 startup
```

**PM2 Configuration File** (`ecosystem.config.js`):

```javascript
module.exports = {
  apps: [
    {
      name: 'my-agent',
      script: 'dist/index.js',
      args: '--telegram',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

**PM2 Commands:**

```bash
# Start
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs my-agent

# Restart
pm2 restart my-agent

# Stop
pm2 stop my-agent

# Delete
pm2 delete my-agent
```

### 2. Systemd Service

For Linux servers:

**Create service file** (`/etc/systemd/system/my-agent.service`):

```ini
[Unit]
Description=My Agent - AI Agent Service
After=network.target

[Service]
Type=simple
User=agent
Group=agent
WorkingDirectory=/opt/my-agent
ExecStart=/usr/bin/node dist/index.js --telegram
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/my-agent/.env

[Install]
WantedBy=multi-user.target
```

**Commands:**

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable my-agent

# Start service
sudo systemctl start my-agent

# Check status
sudo systemctl status my-agent

# View logs
sudo journalctl -u my-agent -f
```

### 3. Docker

**Dockerfile:**

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# Create non-root user
RUN addgroup -g 1001 -S agent
RUN adduser -S agent -u 1001
USER agent

EXPOSE 3000
CMD ["node", "dist/index.js", "--telegram"]
```

**Build and Run:**

```bash
# Build image
docker build -t my-agent .

# Run container
docker run -d \
  --name my-agent \
  --restart unless-stopped \
  -p 3000:3000 \
  -v ./data:/app/data \
  -v ./.env:/app/.env:ro \
  my-agent
```

**Docker Compose** (`docker-compose.yml`):

```yaml
version: '3.8'

services:
  my-agent:
    build: .
    container_name: my-agent
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
      - ./.env:/app/.env:ro
    environment:
      - NODE_ENV=production
```

```bash
# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 4. Cloud Platforms

#### Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create my-agent

# Set environment variables
heroku config:set OPENROUTER_API_KEY=your_key
heroku config:set MODEL=qwen/qwen3-8b
heroku config:set TELEGRAM_BOT_TOKEN=your_token

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

**Procfile:**

```
worker: node dist/index.js --telegram
web: node dist/index.js --api
```

#### Railway

1. Connect your GitHub repository
2. Set environment variables in Railway dashboard
3. Deploy automatically on push

#### Render

1. Create a new Web Service
2. Connect your repository
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables

## Reverse Proxy (Nginx)

For production with SSL:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring

### Health Checks

```bash
# Health check
curl http://localhost:3000/health

# Readiness check
curl http://localhost:3000/ready

# Metrics
curl http://localhost:3000/metrics
```

### Log Monitoring

```bash
# View application logs
tail -f data/logs/app.log

# Or with PM2
pm2 logs my-agent
```

### Uptime Monitoring

Use services like:

- UptimeRobot
- Pingdom
- Better Uptime

Configure to check `/health` endpoint every 5 minutes.

## Backup

### Database Backup

```bash
# Backup SQLite database
cp data/agent.db data/agent.db.backup-$(date +%Y%m%d)

# Or use SQLite backup command
sqlite3 data/agent.db ".backup 'data/agent.db.backup'"
```

### Cron Jobs Backup

```bash
# Backup cron jobs
cp data/crons.json data/crons.json.backup-$(date +%Y%m%d)
```

### Automated Backups

Create a cron job for automated backups:

```bash
# Edit crontab
crontab -e

# Add backup job (daily at 2am)
0 2 * * * /opt/my-agent/scripts/backup.sh
```

**Backup script** (`scripts/backup.sh`):

```bash
#!/bin/bash
BACKUP_DIR="/opt/my-agent/backups"
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# Backup database
cp /opt/my-agent/data/agent.db $BACKUP_DIR/agent.db.$DATE

# Backup cron jobs
cp /opt/my-agent/data/crons.json $BACKUP_DIR/crons.json.$DATE

# Keep only last 30 days of backups
find $BACKUP_DIR -type f -mtime +30 -delete
```

## Security

### Environment Variables

- Never commit `.env` files
- Use secrets management in production
- Rotate API keys regularly

### Network Security

- Use HTTPS in production
- Configure CORS properly
- Use rate limiting
- Implement IP whitelisting if needed

### File Permissions

```bash
# Set proper permissions
chmod 600 .env
chmod 700 data/
```

## Performance Tuning

### Node.js Options

```bash
# Increase memory limit
node --max-old-space-size=4096 dist/index.js

# Enable garbage collection logging
node --trace-gc dist/index.js
```

### Database Optimization

```bash
# Vacuum SQLite database periodically
sqlite3 data/agent.db "VACUUM;"
```

### Caching

- Enable context compression: `CONTEXT_COMPRESSION=1`
- Use appropriate `MAX_OUTPUT_TOKENS`

## Troubleshooting

### Common Issues

**Port already in use:**

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

**Database locked:**

```bash
# Check for multiple instances
ps aux | grep node

# Kill duplicate processes
pkill -f "node dist/index.js"
```

**Out of memory:**

```bash
# Increase Node.js memory
node --max-old-space-size=8192 dist/index.js

# Or set in PM2
pm2 start dist/index.js --max-memory-restart 2G
```

**Telegram bot not responding:**

```bash
# Check bot token
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe

# Check webhook status
curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

## Scaling

### Horizontal Scaling

For multiple instances:

1. Use a load balancer (Nginx, HAProxy)
2. Share database (use PostgreSQL instead of SQLite)
3. Use Redis for session storage
4. Implement sticky sessions for Telegram

### Vertical Scaling

- Increase server resources (CPU, RAM)
- Use SSD storage for database
- Optimize Node.js settings

## Maintenance

### Regular Tasks

1. **Daily:** Check logs for errors
2. **Weekly:** Review metrics and performance
3. **Monthly:** Update dependencies, rotate keys
4. **Quarterly:** Full security audit

### Update Process

```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build
npm run build

# Restart service
pm2 restart my-agent
# Or
sudo systemctl restart my-agent
```
