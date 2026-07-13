# @flash-sale/frontend

React + Vite + TypeScript client for the Flash Sale System.

## Running locally

1. From the repo root, install dependencies (devDependencies are required for Vite/TypeScript):
   ```
   npm install --include=dev
   ```
2. Start the backend (in another terminal), so it is listening on `http://localhost:3000`.
3. Start the frontend dev server:
   ```
   npm run dev --workspace @flash-sale/frontend
   ```

The dev server proxies any request to `/api` to `http://localhost:3000`, so no CORS configuration is needed on the client side.

## Build

```
npm run build --workspace @flash-sale/frontend
```

This type-checks the project and produces a production build in `dist/`. Preview it with:

```
npm run preview --workspace @flash-sale/frontend
```
