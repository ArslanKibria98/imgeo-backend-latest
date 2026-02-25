# shippro

## Environment

Create a `.env` file:

- **MONGO_URI**: Mongo connection string
- **PORT**: server port (default `3000`)
- **JWT_SECRET**: JWT secret (optional)
- **CORS_ORIGINS**: comma-separated list of frontend origins allowed to call this API (recommended for production)
  - Example: `CORS_ORIGINS=http://localhost:5173,https://your-frontend.com`
  - Alternative: set **FRONTEND_URL** to a single origin
