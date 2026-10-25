# Pacioli

- `backend/` — SpacetimeDB module (TypeScript), deployed to maincloud as `cal-hacks-ansingh`
- `frontend/` — Vite + React app that connects to it

## Setup

```sh
curl -sSf https://install.spacetimedb.com | sh   # SpacetimeDB CLI
spacetime login                                   # browser login for maincloud

cd backend && npm install && npm run publish      # deploy module to maincloud
cd ../frontend && npm install && npm run dev      # http://localhost:5173
```

## After changing tables/reducers in `backend/src/index.ts`

```sh
cd backend
npm run publish     # redeploy (npm run publish:reset wipes data on schema conflicts)
npm run generate    # regenerate frontend/src/module_bindings
```
