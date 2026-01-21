# Local Farmers Backend

Express API for Local Farmers. Provides health checks and API endpoints for the frontend.

## Requirements
- Node.js 18+
- npm

## Setup
```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts
- `npm run dev` - start the API with live reload.
- `npm start` - run the API in production mode.
- `npm test` - run Jest + Supertest tests.
- `npm run lint` - run ESLint.
- `npm run format` - check formatting with Prettier.

## Environment
- `PORT` - API port (default: 3000)
- `CORS_ORIGINS` - comma-separated list of allowed origins

## File-based Storage
Data is stored in JSON files under the repo root `data/` directory (users, vendors, products, markets, cache). This is suitable for local development and hosts with persistent disks.

## Optional External API Configuration
- `USDA_MARKETNEWS_API_KEY` - API key for USDA Market News (if available)
- `USDA_MARKETNEWS_BASE_URL` - override Market News base URL
- `FAOSTAT_BASE_URL` - override FAOSTAT base URL
- `PEXELS_API_KEY` - API key for Pexels image search
- `PEXELS_BASE_URL` - override Pexels base URL
