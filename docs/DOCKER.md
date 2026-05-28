# Docker — Running Changttendance locally

Prerequisites:
- Docker (and Docker Compose) installed and running on your machine.
- Optional: VS Code with the Docker extension.

Manual start:
1. From the project root, build and start services:
   ```bash
   docker compose up --build -d
   ```
2. Verify services:
   - Web app: http://localhost:8080
   - Postgres: localhost:5432 (user: chang, password: changpass, db: changttendance)
3. Follow logs:
   ```bash
   docker compose logs -f web
   ```
4. Stop and remove containers:
   ```bash
   docker compose down
   ```

VS Code one-click:
- Open the Command Palette (Ctrl+Shift+P) → "Tasks: Run Task" → select "Start Everything".
- This runs `Docker: Build and Up` and then `Docker: Follow Logs` so you see runtime output.

Notes:
- If `npm run build` fails inside the Docker build, run the build locally to inspect errors:
  ```bash
  npm ci
  npm run build
  ```

- For development, consider running `npm run dev` locally instead of using the production image.
