# Approval Document Viewer

This project renders archived Hiworks approval documents behind a small Express server that authenticates users through MariaDB sessions.

## Prerequisites

* Node.js 18 or newer
* Access to a MariaDB instance that contains an `approvaldb.users` table with the following columns:
  * `username` (PRIMARY KEY)
  * `password_hash` (base64-encoded SHA-512 string)
  * `role` (enum of `admin` or `user`)
  * `name` (full name of the employee)
  * `must_change_password` (boolean/TINYINT flag that forces a password change on next login)
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
  | `INITIAL_PASSWORD_HASH` | (Optional) Base64 SHA-512 hash that represents your default bootstrap password. Users matching this hash will be forced to change their password even if the flag is unset. |

   You can place these values in a `.env` file during development. The server always connects to the `approvaldb` schema.

   A `.env.example` file is provided with common local defaults; copy it to `.env` and update `SESSION_SECRET` to a strong, unique value before running the server.

3. Start the user-facing viewer server:

   ```bash
   npm start
   ```

4. (Optional) Start the administrator interface on port `3001` (or set `ADMIN_PORT`):

   ```bash
   node server/admin.js
   ```

   Log in at `http://localhost:3001/` with an administrator account to add users, reset passwords, or review existing accounts. The admin server shares the same `.env` configuration and session secret as the viewer app.

5. Open `http://localhost:PORT/` to view the approval archive. Authenticated requests will load document metadata from disk after verifying the active session. Navigate to `http://localhost:PORT/login.html` to authenticate, and use `/api/logout` to clear a session if needed.

### Handling initial passwords

* Administrator-created accounts (or those reset from the admin interface) are stored with `must_change_password = 1`. When such a user authenticates through `/api/login`, the server returns `{ requirePasswordChange: true, userId }` instead of establishing a session.
* Clients should then call `POST /api/password/change` with `{ id, currentPassword, newPassword }`. A successful change updates the stored hash, clears the `must_change_password` flag, and creates a normal session.
* If you provide `INITIAL_PASSWORD_HASH`, any account that still matches the bootstrap password will be treated as an initial password even if `must_change_password` was not populated.

## Creating an administrator account

1. Generate a base64-encoded SHA-512 hash for the desired password:

   ```bash
   node -e "console.log(require('crypto').createHash('sha512').update(process.argv[1]).digest('base64'))" '새_비밀번호'
   ```

2. Insert the administrator into MariaDB:

   ```sql
   INSERT INTO approvaldb.users (username, password_hash, role, name)
   VALUES ('admin_id', '위에서_생성한_해시', 'admin', '관리자_이름');
   ```

   이후 `http://localhost:3001/`에서 해당 계정으로 로그인한 뒤 필요한 사용자를 추가하거나 비밀번호를 변경할 수 있습니다.
   일반 사용자는 `role`을 `user`로, `name`은 전자결재 문서의 기안자 이름과 동일하게 입력해야 본인이 기안한 문서만 열람할 수 있습니다.

## Development Notes

* Static assets (CSS, images, legacy scripts) are served from the `static/` directory.
* Archived document payloads in `data/data.js` and `data/data_info.js` are only read on the server and are no longer exposed as public scripts.
* Front-end scripts call `/api/session` and `/api/documents` to hydrate the viewer with authenticated data before running `Approval.init()`.
