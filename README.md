# RxHouse Backend

This folder contains the standalone backend API server for Rx House.

## Setup

1. Open a terminal in `d:\Website\website1\medicine\backend`
2. Run `npm install`
3. Run `npm start`
4. The API will be available at `http://localhost:3000`

## API Endpoints

- `GET /api/products`
- `POST /api/orders`
- `GET /api/orders`
- `POST /api/social-click`
- `GET /api/social-clicks`
- `GET /health`

## Deployment

You can deploy this backend to a free Node host such as Railway, Render, or Fly.io.

This backend now uses PostgreSQL. Configure your Postgres connection via the `DATABASE_URL` environment variable in the following format:

```
postgres://<user>:<password>@<host>:<port>/<database>
```

Examples:
- Local Postgres: `postgres://postgres:postgres@localhost:5432/rxhouse`
- Railway / Render will provide a `DATABASE_URL` automatically.

Note: Vercel serverless functions do not provide a reliable writable filesystem for SQLite persistence. On Vercel either use a remote database (Postgres, Supabase, PlanetScale) or deploy the Express backend to a platform that supports long-running processes.
