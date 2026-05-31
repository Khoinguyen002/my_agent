# API Reference

## HTTP API Endpoints

### Health Check

```http
GET /health
```

Returns the health status of the application.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "development"
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "unhealthy",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "error": "Database connection failed"
}
```

---

### Readiness Check

```http
GET /ready
```

Returns whether the application is ready to accept requests.

**Response (200 OK):**

```json
{
  "status": "ready",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "services": {
    "database": "connected",
    "api": "running"
  }
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "not_ready",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "error": "Database not initialized"
}
```

---

### Metrics

```http
GET /metrics
```

Returns application metrics and statistics.

**Response (200 OK):**

```json
{
  "timestamp": "2026-05-30T12:00:00.000Z",
  "metrics": {
    "conversations": 150,
    "messages": 1250,
    "uptime": 3600,
    "memory": {
      "rss": 50000000,
      "heapTotal": 30000000,
      "heapUsed": 20000000,
      "external": 5000000,
      "arrayBuffers": 1000000
    }
  }
}
```

**Response (500 Internal Server Error):**

```json
{
  "error": "Failed to retrieve metrics"
}
```

---

### Price List Upload

```http
POST /api/price-list
Content-Type: multipart/form-data
```

Upload and parse price list images using AI-powered OCR.

**Request Body:**

- `file`: Image file(s) to upload
  - Accepted formats: JPEG, PNG, GIF, WebP
  - Max file size: 10MB per file
  - Max files: 50 per request

**Headers:**

- `Accept: text/event-stream` — Enable Server-Sent Events (SSE) for real-time updates
- `?stream=1` — Alternative way to enable SSE

**Response (SSE Stream):**

When SSE is enabled (single file only):

```
event: start
data: {"message":"Uploading file"}

event: received
data: {"filename":"price-list.jpg","mimetype":"image/jpeg"}

event: enhancing
data: {"message":"Enhancing image"}

event: uploaded
data: {"fileId":"abc123","url":"https://drive.google.com/...","folderUrl":"https://drive.google.com/..."}

event: result
data: {
  "items": [
    {
      "name": "Product A",
      "price": 29.99,
      "currency": "USD",
      "description": "Description of product A",
      "category": "Electronics"
    }
  ],
  "driveUrl": "https://drive.google.com/...",
  "driveFolderUrl": "https://drive.google.com/...",
  "filename": "price-list.jpg"
}

event: done
data: {"ok":true}

event: error
data: {"error":"Error message"}
```

**Response (JSON):**

When SSE is not enabled (or multiple files):

```json
[
  {
    "items": [
      {
        "name": "Product A",
        "price": 29.99,
        "currency": "USD",
        "description": "Description of product A",
        "category": "Electronics"
      }
    ],
    "driveUrl": "https://drive.google.com/...",
    "driveFolderUrl": "https://drive.google.com/...",
    "filename": "price-list.jpg"
  }
]
```

**Error Responses:**

| Status | Description                  |
| ------ | ---------------------------- |
| 400    | Missing file or invalid file |
| 413    | File too large (>10MB)       |
| 429    | Rate limit exceeded          |
| 500    | Internal server error        |

---

## Rate Limiting

- **Limit:** 100 requests per minute per IP
- **Headers:**
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Time when the rate limit resets
  - `Retry-After`: Seconds to wait before retrying (on 429)

**Error Response (429):**

```json
{
  "code": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Retry after 60"
}
```

---

## Security Headers

All responses include:

| Header                      | Value                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Content-Security-Policy`   | `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:` |
| `X-Frame-Options`           | `SAMEORIGIN`                                                                                           |
| `X-Content-Type-Options`    | `nosniff`                                                                                              |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                                                                  |
| `X-XSS-Protection`          | `1; mode=block`                                                                                        |

---

## CORS

Configure allowed origins via `CORS_ORIGINS` environment variable:

```env
CORS_ORIGINS=https://app.example.com,http://localhost:5173
```

If not configured, CORS is not enabled.

---

## Error Responses

All error responses follow this format:

```json
{
  "name": "ErrorType",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "timestamp": "2026-05-30T12:00:00.000Z"
}
```

### Common Error Codes

| Code               | Status | Description                |
| ------------------ | ------ | -------------------------- |
| `VALIDATION_ERROR` | 400    | Invalid input data         |
| `AUTH_ERROR`       | 401    | Authentication required    |
| `RATE_LIMIT_ERROR` | 429    | Too many requests          |
| `MODEL_ERROR`      | 502    | AI model call failed       |
| `NETWORK_ERROR`    | 503    | Network connectivity issue |
| `DATABASE_ERROR`   | 500    | Database operation failed  |
| `TOOL_ERROR`       | 500    | Tool execution failed      |
| `CONFIG_ERROR`     | 500    | Configuration error        |
