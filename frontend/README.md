# CreatorVault Frontend

This is the Next.js frontend for the CreatorVault platform. It's pre-configured with Tailwind CSS v4, React Hook Form, Zustand, and standard directory scaffolding so you can dive straight into building UI components.

## Directory Structure

We use the Next.js App Router. The `src/app` directory is organized into two main route groups:

*   **`(auth)`**: Public routes for `login`, `register`, and password resets.
*   **`(dashboard)`**: Protected routes representing the main app interface (Deals, Contracts, Payments, Profile). Wrapped in a persistent sidebar layout.

### Key Folders

*   `src/app/` - Page and layout definitions.
*   `src/components/` - Broken down by feature domain (`deals`, `contracts`, `payments`, `trust`) and `ui` (for raw shadcn/ui or headless components).
*   `src/lib/` - Utility functions and the global Axios `api.ts` client.
*   `src/stores/` - Global Zustand stores (`auth-store.ts`, `ui-store.ts`).
*   `src/types/` - Shared TypeScript interfaces.

## Getting Started

1.  Make sure the backend is running on `http://localhost:5000`.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up environment variables:
    Create a `.env.local` file:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
    ```
4.  Start the development server:
    ```bash
    npm run dev
    ```

## Connecting to the API

The `src/lib/api.ts` file exports a pre-configured Axios instance. 

**First Task:** 
You need to configure the Axios interceptors in `src/lib/api.ts` to attach the Bearer token (JWT) from your Zustand `auth-store` to outgoing requests, and to automatically attempt a refresh token flow if a request fails with a `401 Unauthorized` status.

All backend endpoints are listed in the `backend/README.md` (or the Implementation Plan). Responses follow this standard envelope:
```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```
