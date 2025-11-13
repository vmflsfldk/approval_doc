# Manual Scenario: Initial Password Change Flow

This scenario verifies the login → forced password change → successful login path.

1. Ensure the MySQL `users` table contains the `must_change_password` column and that the application has been restarted after deploying code changes.
2. In the admin UI (or via SQL), create a user with an easily remembered initial password. Confirm that the record has `must_change_password = 1`.
3. Attempt to log into `/login.html` using the new credentials. The client should receive a JSON response from `/api/login` with `{ "requirePasswordChange": true, "userId": "<username>" }` and no session cookie.
4. From the client, call `POST /api/password/change` with the following JSON payload:
   ```json
   {
     "id": "<username>",
     "currentPassword": "<initial password>",
     "newPassword": "<new password>"
   }
   ```
   The response should be `{ "success": true }`, and a new session cookie should be issued.
5. Refresh the page and invoke `/api/session`. The response should indicate `authenticated: true` and list the user's ID and role, confirming normal access.
6. Optionally verify in the database that the user's `must_change_password` flag is now `0` and that the stored `password_hash` matches the new password.
