# Approval Document Viewer

This project renders archived Hiworks approval documents behind a small Express server that authenticates users through MariaDB sessions.

## Prerequisites

* Node.js 18 or newer
* Access to a MariaDB instance that contains an `approvaldb.users` table with `id` and `password` (base64-encoded SHA-512) columns
* The archived document payloads located in the repository `data/` directory

## Installation

1. Install Node dependencies:

   ```bash
   npm install
   ```

2. Configure the following environment variables before starting the server:

   | Variable | Description |
   | --- | --- |
   | `DB_HOST` | MariaDB host name |
   | `DB_PORT` | MariaDB port (optional, defaults to `3306`) |
   | `DB_USER` | MariaDB username with access to `approvaldb` |
   | `DB_PASSWORD` | Password for `DB_USER` |
   | `SESSION_SECRET` | Secret string for signing Express sessions |
   | `PORT` | Port for the Express server (optional, defaults to `3000`) |

   You can place these values in a `.env` file during development. The server always connects to the `approvaldb` schema.

   A `.env.example` file is provided with common local defaults; copy it to `.env` and update `SESSION_SECRET` to a strong, unique value before running the server.

3. Start the server:

   ```bash
   npm start
   ```

4. Open `http://localhost:PORT/` to view the approval archive. Authenticated requests will load document metadata from disk after verifying the active session. Navigate to `http://localhost:PORT/login.html` to authenticate, and use `/api/logout` to clear a session if needed.

## Development Notes

* Static assets (CSS, images, legacy scripts) are served from the `static/` directory.
* Archived document payloads in `data/data.js` and `data/data_info.js` are only read on the server and are no longer exposed as public scripts.
* Front-end scripts call `/api/session` and `/api/documents` to hydrate the viewer with authenticated data before running `Approval.init()`.
