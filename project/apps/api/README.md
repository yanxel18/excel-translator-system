# Backend

The NestJS API authenticates users, manages translation jobs and exposes REST and GraphQL endpoints. Prisma stores metadata in PostgreSQL; workbook files live in `DATA_DIR`. The API sends extracted text to Ollama and patches the translated workbook. See `src/modules` and `prisma/schema.prisma` for implementation details.

## Local development

Use Node.js 22+, npm, PostgreSQL and Ollama. Configure the root `.env` as described in the [root guide](../../../README.md), then run `docker compose up -d postgres` from the root to start PostgreSQL. Start Ollama and pull the configured model. From this directory:

```sh
cp .env.example .env
npm ci
npm run prisma:generate
npm run db:deploy
npm run build
npm start
```

Example local `.env`; the database credentials must match the initialized database:

```dotenv
NODE_ENV=development
PORT=3000
BASE_PATH=/excel-convert
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://excel_translator:localdbpassword@localhost:5432/excel_translator?schema=public
DATA_DIR=./data
JWT_SECRET=local-development-signing-secret-change-before-deployment
AUTH_USERNAME=user
AUTH_PASSWORD=localpassword
LOCAL_AUTH_ENABLED=true
AUTH_BOOTSTRAP_ENABLED=true
ADMIN_USERNAMES=user
KEYCLOAK_ENABLED=false
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:latest
```

These credentials are for local development. `npm run dev` starts watch mode. The health endpoint is `http://localhost:3000/excel-convert` and GraphQL is at `/excel-convert/graphql`. When enabled, bootstrap creates the configured local account on first successful login; changing the environment password does not overwrite an existing account.

## Docker and operations

From the repository root, `docker compose up --build -d translator-api` starts the API and healthy PostgreSQL dependency. Migrations run before the API starts. Configure an Ollama address reachable from the container. Use `docker compose logs -f translator-api` for startup and migration output. Back up both named volumes because database records refer to workbook files. See the [deployment guide](../../docs/DEPLOYMENT.md) for authentication, preview and operations.
