# Theme Park Wait Times Application

## Project Overview
- Real-time theme park wait time tracking application
- Users can monitor favorite attractions
- Alert system for wait time changes
- Consumes external wait time APIs

## Tech Stack
- Backend: Node.js/Express
- Frontend: React with Vite with Vite
- Database: PostgreSQL (Docker)
- Authentication: Required for user accounts

## Project Structure
```
/
├── backend/         # Node.js/Express server
├── frontend/        # React application (Vite-powered)
├── docker/          # Docker compose and related files
└── docs/           # Documentation
```

## Development Guidelines
- Use TypeScript for type safety
- Follow REST API principles
- Keep sensitive configuration in .env files
- Prefer simple, minimal configuration files
- Avoid unnecessary complexity in infrastructure setup
- TypeScript must be configured with "jsx": "react" in tsconfig.json for React components
- TypeScript must be configured with "jsx": "react" in tsconfig.json for React components

## Authentication Flow
- Users must authenticate to access application features
- Public routes: signup, login
- Protected routes: dashboard, wait times
- Session-based authentication required
- User accounts stored in PostgreSQL
