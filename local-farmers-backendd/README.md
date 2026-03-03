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
- `SUPABASE_URL` - Supabase project URL (defaults to configured project URL)
- `SUPABASE_PUBLISHABLE_KEY` - Supabase publishable key
- `SUPABASE_SERVICE_ROLE_KEY` - backend secret key used to bypass restrictive RLS for server writes
- `SUPABASE_BUCKET_PRODUCT_PHOTOS` - optional override for product image bucket name (default: `product photos`)
- `SUPABASE_BUCKET_FARMER_PHOTOS` - optional override for farm gallery bucket name (default: `farmer photos`)
- `SESSION_SECRET` - secret used to sign auth session cookies

## Data Storage
Primary data is stored in Supabase (`users`, `farmers`, `customers`, `products`, `farm_photos`)
and media in Supabase Storage buckets (`product-photos`, `farm-photos`).
Legacy JSON files under `data/` are cleaned up at startup to avoid state conflicts.

## Optional External API Configuration
- `USDA_MARKETNEWS_API_KEY` - API key for USDA Market News (if available)
- `USDA_MARKETNEWS_BASE_URL` - override Market News base URL
- `FAOSTAT_BASE_URL` - override FAOSTAT base URL
- `PEXELS_API_KEY` - API key for Pexels image search
- `PEXELS_BASE_URL` - override Pexels base URL
