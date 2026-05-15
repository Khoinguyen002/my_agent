# Price-List API — Integration Guide

## Overview

`POST /api/price-list` accepts one or more handwritten price-list images, enhances them, uploads to Google Drive, runs OCR via an LLM, and returns structured JSON.

| Feature | Detail |
|---------|--------|
| Max file size | 20 MB per image |
| Max files per request | 50 |
| Concurrent processing | 10 jobs (global queue, retry ×3) |
| Streaming | SSE supported for single-file requests |
| Image preprocessing | Grayscale → Normalize → Sharpen → PNG |

---

## Setup

### 1. Enable the server

```env
API_PORT=3000
```

Set `API_PORT` to `0` to disable the HTTP server entirely.

### 2. Google Drive credentials

The API uploads every processed image to Google Drive. Create OAuth 2.0 credentials at [console.cloud.google.com](https://console.cloud.google.com) and add to `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-secret
GOOGLE_OAUTH_REFRESH_TOKEN=your-refresh-token

# Optional: upload into a specific Drive folder
DRIVE_FOLDER_ID=1ABC...XYZ

# Set to 0 to keep uploaded files private
DRIVE_PUBLIC=1
```

### 3. Product hints (optional)

Comma-separated known product names improve OCR accuracy:

```env
PRODUCT_HINTS=ca rot,su tim,la lot,ca hoi
```

---

## Endpoint

```
POST http://localhost:3000/api/price-list
Content-Type: multipart/form-data
```

### Single file — JSON response

```bash
curl -X POST \
  -F "file=@./data/image.png" \
  http://localhost:3000/api/price-list
```

**Response `200`:**
```json
{
  "items": [
    {
      "item": "Coi beef",
      "quantity": 18,
      "unit_price": 41,
      "total": 738,
      "note": ""
    },
    {
      "item": "Su tim",
      "quantity": 8,
      "unit_price": 17,
      "total": 136,
      "note": "item may be 'Sú tím' or 'Su tim'"
    }
  ],
  "grand_total": 6333,
  "summary_note": "10 - 5",
  "driveUrl": "https://drive.google.com/uc?export=download&id=FILE_ID",
  "filename": "image.png"
}
```

### Batch — multiple files

```bash
curl -X POST \
  -F "file=@./data/image.png" \
  -F "file=@./data/imagec.png" \
  http://localhost:3000/api/price-list
```

**Response `200`:** array of result objects (same shape as single), one per file, in submission order.

```json
[
  { "items": [...], "grand_total": 6333, "driveUrl": "...", "filename": "image.png" },
  { "items": [...], "grand_total": 2100, "driveUrl": "...", "filename": "imagec.png" }
]
```

> Files are processed in parallel (up to 10 at a time). The response waits for all jobs to complete before returning.

### Single file — SSE streaming

Trigger SSE by either:
- Setting `Accept: text/event-stream` header
- Adding `?stream=1` query param

```bash
curl -N \
  -H "Accept: text/event-stream" \
  -F "file=@./data/image.png" \
  http://localhost:3000/api/price-list
```

```bash
# or via query param
curl -N \
  -F "file=@./data/image.png" \
  "http://localhost:3000/api/price-list?stream=1"
```

> SSE is only available for single-file requests. Multi-file requests always return a JSON array.

---

## SSE Event Reference

Events are emitted in this order:

| Event | Payload | Description |
|-------|---------|-------------|
| `start` | `{ message: string }` | Request accepted |
| `received` | `{ filename: string, mimetype: string }` | File received and buffered |
| `enhancing` | `{ message: string }` | Image enhancement started |
| `uploaded` | `{ fileId: string, url: string }` | Drive upload complete |
| `delta` | `{ type: "content" \| "reasoning", text: string }` | Streaming model token |
| `result` | Full result object (see JSON schema below) | Final parsed output |
| `done` | `{ ok: true }` | Stream closed normally |
| `error` | `{ error: string }` | Unrecoverable error; stream closes after this |

### Reading SSE in JavaScript

```js
const form = new FormData();
form.append('file', fileInput.files[0]);

const response = await fetch('http://localhost:3000/api/price-list', {
  method: 'POST',
  headers: { Accept: 'text/event-stream' },
  body: form,
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep incomplete last line

  let eventName = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventName = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      const payload = JSON.parse(line.slice(6));
      handleEvent(eventName, payload);
    }
  }
}

function handleEvent(event, payload) {
  if (event === 'delta')  console.log('[stream]', payload.text);
  if (event === 'result') console.log('[result]', payload);
  if (event === 'error')  console.error('[error]', payload.error);
}
```

### Reading SSE in Python

```python
import requests

with requests.post(
    'http://localhost:3000/api/price-list',
    files={'file': open('image.png', 'rb')},
    headers={'Accept': 'text/event-stream'},
    stream=True,
) as resp:
    event_name = ''
    for raw_line in resp.iter_lines(decode_unicode=True):
        if raw_line.startswith('event: '):
            event_name = raw_line[7:]
        elif raw_line.startswith('data: '):
            import json
            payload = json.loads(raw_line[6:])
            if event_name == 'result':
                print('items:', payload['items'])
            elif event_name == 'error':
                print('error:', payload['error'])
```

---

## Response Schema

```typescript
type PriceListItem = {
  item:       string;         // literal OCR transcription
  quantity:   number | null;  // first number on the row
  unit_price: number | null;  // second number on the row
  total:      number | null;  // number after "="
  note:       string;         // uncertainty flag, empty if confident
};

type PriceListResult = {
  items:        PriceListItem[];
  grand_total:  number | null;  // summed total below the last row
  summary_note: string;         // extra text on page, or reason if no price list found
  driveUrl:     string;         // public Google Drive URL of the enhanced image
  filename:     string;         // original uploaded filename
};
```

---

## Error Responses

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "Missing file" }` | No `file` field in the request |
| `500` | `{ "error": "..." }` | Drive upload failed, model error, or server crash |

For SSE requests, errors are emitted as an `error` event instead of an HTTP status code.

---

## Drive Folder Structure

Each uploaded image is placed inside a subfolder named after the original filename (without extension):

```
DRIVE_FOLDER_ID/
├── image/
│   └── price-list-1748824746555.png
├── imagec/
│   └── price-list-1748824751234.png
└── menu/
    └── price-list-1748824799000.png
```

If `DRIVE_FOLDER_ID` is not set, files are uploaded to the root of My Drive.

---

## Queue & Retry Behaviour

- **Concurrency**: at most 10 jobs run simultaneously across all active requests.
- **Retry**: each job is retried up to 3 times on failure with exponential backoff (500 ms → 1 s → 2 s).
- **Backpressure**: requests beyond the 10-job limit are queued in memory and processed as slots free up.
- **Batch ordering**: the JSON array response preserves the original file submission order regardless of completion order.

---

## Quick-reference cURL examples

```bash
# Single file, JSON
curl -X POST -F "file=@image.png" http://localhost:3000/api/price-list

# Single file, SSE
curl -N -H "Accept: text/event-stream" -F "file=@image.png" http://localhost:3000/api/price-list

# Single file, SSE via query param
curl -N -F "file=@image.png" "http://localhost:3000/api/price-list?stream=1"

# Batch
curl -F "file=@image.png" -F "file=@imagec.png" http://localhost:3000/api/price-list

# Local test images
curl -N -H "Accept: text/event-stream" \
  -F "file=@./data/image.png" \
  http://localhost:3000/api/price-list
```
