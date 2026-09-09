<p align="center"><img src="assets/readme-hero.svg" alt="Drive Uploads large-file uploader" width="100%"></p>

# Drive Uploads

**A large-file uploader built for the frustrating cases where a normal upload is too fragile: big videos, backups, datasets, project archives, or other files that should be able to continue after a network interruption instead of starting again from zero.**

## Why this is useful

Uploading a small image is easy. Uploading several gigabytes over Wi-Fi, mobile data, or an unstable connection is different. A single interruption can waste time and bandwidth when the whole transfer must restart.

Drive Uploads is useful for:

- creators sending large video exports or raw media;
- developers moving build artifacts, datasets, backups or project archives;
- users on unstable connections who need resumable transfers;
- applications that want one upload experience while supporting different storage destinations;
- testing chunk size, concurrency and retry behavior under different network conditions;
- learning how browser workers, resumable upload protocols and cloud adapters fit together.

## What the user gets

```text
Choose or drop a large file
          |
          v
Split into manageable chunks
          |
          v
Upload several chunks safely
          |
     connection fails?
       /        \
     yes         no
      |           |
 resume missing   |
 chunks only      |
       \          /
        v        v
      completed file
        on selected storage
```

Instead of treating an upload as one all-or-nothing request, the project tracks transfer progress and can retry smaller pieces of work.

## Main capabilities

| Capability | Why it matters |
| --- | --- |
| Chunked uploads | Large files are split into smaller transfer units instead of one fragile request. |
| Resume support | Interrupted work can continue without re-sending everything. |
| Parallel chunks | Multiple chunks can be transferred concurrently when the connection supports it. |
| Adaptive tuning | Chunk size and concurrency can be adjusted for changing network conditions. |
| Progress and ETA | Users can see speed, progress and remaining time instead of waiting blindly. |
| Background workers | Hashing and transfer work can run without blocking the main interface. |
| Storage adapters | The codebase contains adapters for Amazon S3, Google Drive and Google Cloud Storage. |
| Network diagnostics | The UI can surface connection information and tuning recommendations. |

## Architecture

```text
React / Vite client
  |-- FileUploader
  |-- FileCard
  |-- SettingsPanel
  |-- NetworkDiagnostics
  |
  +-- UploadManager
       |-- hash worker
       |-- upload worker
       |
       +-- storage adapters
            |-- S3
            |-- Google Drive
            +-- Google Cloud Storage
                   |
                   v
             server/API layer
                   |
                   v
             selected provider
```

The repository also includes deployment and operations files such as Docker, Nginx, PM2 configuration, performance tests and an `ARCHITECTURE.md` reference.

## Repository layout

```text
Drive-uploads/
├─ client/
│  ├─ src/components/         uploader, file cards, diagnostics, settings
│  ├─ src/services/           upload manager + provider adapters
│  ├─ src/workers/            hashing and upload workers
│  └─ src/test/               client tests
├─ server/                    backend/API responsibilities
├─ ARCHITECTURE.md            deeper design notes
├─ performance-test.js        transfer/performance testing
├─ Dockerfile
├─ docker-compose.yml
├─ nginx.conf
├─ .env.example
└─ assets/                    README artwork
```

## Local development

Install the root dependencies and the client/server dependencies required by the current project structure. A typical workflow is:

```bash
git clone https://github.com/cassielxyz/Drive-uploads.git
cd Drive-uploads
npm install
```

Then install dependencies for the application folders as defined by their package files and copy the safe environment template:

```bash
cp .env.example .env
```

Fill in local credentials without committing the resulting `.env` file.

## Storage configuration

The repository includes adapters for:

- Amazon S3 multipart-style workflows;
- Google Drive resumable uploads;
- Google Cloud Storage resumable uploads.

Provider credentials should remain server-side or use appropriately scoped temporary/presigned authorization. Never embed long-lived cloud secrets in browser JavaScript.

## Reliability principles

A good large-file uploader should assume that failures happen.

- retries should use bounded backoff rather than hammering the provider;
- completed chunks should not be uploaded again unnecessarily;
- duplicate finalization requests should be handled safely;
- progress state should survive predictable interruptions where possible;
- checksum/hash work should not freeze the UI;
- provider-specific errors should be translated into useful user messages;
- cancellation should actually stop queued work and release resources.

## Security notes

- Treat filenames, MIME types and metadata as untrusted input.
- Enforce file-size and type policies on the server, not only in the browser.
- Keep S3/GCS/Drive credentials out of client bundles and Git history.
- Use least-privilege cloud permissions.
- Validate object keys and paths to prevent traversal-style mistakes.
- Rate-limit public upload endpoints before exposing them broadly.
- Scan or quarantine uploaded content when the deployment's threat model requires it.
- Rotate any credential that has ever been committed.

## Where this can grow

Useful future improvements include persistent resume state across browser restarts, upload-session recovery, integrity verification after provider finalization, pause/resume controls, per-user quotas, upload history, signed download links, optional malware scanning, richer bandwidth controls and end-to-end integration tests against provider sandboxes.

## Topics and tags

`large-file-upload` · `resumable-upload` · `chunked-upload` · `file-upload` · `cloud-storage` · `amazon-s3` · `google-drive` · `google-cloud-storage` · `react` · `vite` · `web-workers` · `upload-manager` · `file-transfer`

## Suggested GitHub About description

> Resumable large-file uploader for unreliable networks, using chunking, parallel transfers, retries and pluggable S3, Google Drive and Google Cloud Storage adapters.

<p align="center"><sub>Built so a broken connection does not have to mean a broken upload.</sub></p>
