---
name: cybertron-studio
description: Full-stack scaffold and development assistant for cybertron.studio projects — React frontend + Go backend + SQLite/MySQL/PostgreSQL. Use this skill whenever the user is working on a cybertron.studio app, building a new full-stack service with React + Go, scaffolding API routes in Go, modifying database schema, writing frontend React components, or setting up HTTP logging middleware. Also trigger when the user wants to update interface.md or database.md docs, switch databases from SQLite to MySQL/PostgreSQL, or set up request/response logging for internal or external HTTP calls. Also trigger when the user mentions "port", "dev server", "localhost", or asks why ports are colliding. If the user mentions "cybertron", "cybertron.studio", or is building a React+Go project, use this skill immediately.
---

# cybertron.studio Development Skill

This skill guides full-stack development for cybertron.studio projects:
- **Frontend**: React (TypeScript, mobile-first responsive)
- **Backend**: Go (Gin/Chi router, structured middleware)
- **Database**: SQLite initially → MySQL/PostgreSQL ready (GORM abstraction)
- **Logging**: Every HTTP request/response logged — both inbound and outbound
- **Docs**: `interface.md` and `database.md` kept in sync with every change

## Core Principles

1. **Log everything**: Every inbound request AND every outbound HTTP call must be logged with method, URL, status, latency, and body (truncated for large payloads).
2. **Docs stay current**: After any API or schema change, immediately update `interface.md` and `database.md`. These files are the source of truth for the team.
3. **Mobile-first UI**: All React components use responsive breakpoints starting from mobile. Use CSS Grid/Flexbox with `sm:`, `md:`, `lg:` breakpoints.
4. **DB abstraction**: Always use GORM with the abstraction layer described in `references/go-backend.md` so swapping SQLite → MySQL/PostgreSQL requires only a config change.
5. **File search scope**: When reading or searching for files on disk, only look within the **current working directory** (the project root). Never search the entire disk or home directory. If a file cannot be found in the current working directory, stop and tell the user it was not found — do not expand the search scope.
6. **Permission & credential issues**: When encountering database connection errors, OS permission errors, missing passwords, or any credential/auth problem — **stop immediately and tell the user**. Do not attempt to guess passwords, reset credentials, modify system files, or work around the issue silently. Always communicate the exact error and wait for the user to resolve it together.
7. **Unconfirmed external API methods**: Before calling any third-party or ERP API method that has not been explicitly confirmed to exist (e.g. trying speculative names like `erp.ktype.list`, `erp.store.list`, `erp.warehouse.list`), **stop and ask the user for approval first**. Guessing API method names wastes quota, may trigger unexpected side effects, and erodes trust. Only call an API method you have seen documented or observed working in a prior successful response.
8. **Missing preferred tool**: When the best or preferred tool for a task is missing (a CLI, library, package, or MCP), **stop and report it to the user** with: (a) what the tool is, (b) why it's preferred, (c) what alternatives exist. Then **wait for the user's decision** before proceeding — do not silently fall back to an alternative or install anything on your own.
9. **Use project-derived ports**: Compute `frontend_port = xxx*10+1` and `backend_port = xxx*10+2` from the project name using the algorithm in the **Port Derivation** section below. Never hardcode `:3000`, `:8080`, or other common ports that collide with other tools.

---

## Project Structure

```
project-root/
├── frontend/               # React app
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page-level components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── api/           # API client (axios/fetch wrappers)
│   │   └── types/         # TypeScript interfaces
│   └── package.json
├── backend/                # Go service
│   ├── cmd/server/        # main.go entry point
│   ├── internal/
│   │   ├── handler/       # HTTP handlers
│   │   ├── middleware/    # Logging, auth, CORS middleware
│   │   ├── model/         # GORM models (= DB schema)
│   │   ├── repository/    # DB access layer
│   │   └── service/       # Business logic
│   ├── config/            # Config loading (env vars)
│   └── go.mod
├── interface.md            # ← AUTO-UPDATED: all API endpoints
└── database.md             # ← AUTO-UPDATED: all DB tables/columns
```

---

## Mandatory Workflows

### After any Go handler or route change → update interface.md

Read `references/go-backend.md` → section "interface.md Template" for the exact format.

Document every endpoint:
- Method + path
- Query params / path params
- Request body (JSON schema)
- Response body (JSON schema)
- Possible error codes

### After any GORM model change → update database.md

Read `references/go-backend.md` → section "database.md Template" for the format.

Document every table:
- Column name, type, constraints
- Indexes
- Foreign keys
- Migration notes (e.g., "added 2026-03-25")

### When adding HTTP logging middleware

Read `references/go-backend.md` → section "HTTP Logging Middleware". Copy the middleware exactly — it handles both inbound requests and outbound HTTP client calls.

### When building React components

Read `references/react-frontend.md` for:
- Responsive layout patterns
- API client setup with request/response interceptors (mirrors backend logging)
- TypeScript interface conventions that must match `interface.md`

### When setting up or migrating the database

Read `references/go-backend.md` → section "Database Setup & Migration" for GORM config that supports SQLite, MySQL, and PostgreSQL via a single env var.

---

## Quick-Start: New Project

```bash
# Backend
mkdir -p backend/cmd/server backend/internal/{handler,middleware,model,repository,service} backend/config
cd backend && go mod init cybertron.studio/backend
go get gorm.io/gorm gorm.io/driver/sqlite gorm.io/driver/mysql gorm.io/driver/postgres
go get github.com/gin-gonic/gin github.com/gin-contrib/cors go.uber.org/zap

# Frontend
cd ../frontend
npm create vite@latest . -- --template react-ts
npm install axios @tanstack/react-query
```

Then follow the templates in the reference files.

---

## Reference Files

- `references/go-backend.md` — Go backend patterns: middleware, GORM setup, handler templates, interface.md & database.md formats
- `references/react-frontend.md` — React patterns: responsive layout, API client, component structure, TypeScript types

Read the relevant reference file before writing any code.

---

## Port Derivation

Deterministic port derivation — no collisions with `:3000`, `:5000`, `:8080`, etc.

### Algorithm

```
letters = lowercase a-z characters of the project name (strip dots, hyphens, spaces, numbers)
sum     = Σ letter_value   (a=1, b=2, … z=26)
xxx     = (sum % 700) + 200          # always in [200, 899]
SKIP    = {300, 500, 800, 808}       # too close to :3000, :5000, :8080, :8008/:8888
if xxx in SKIP: xxx += 1

frontend_port = xxx * 10 + 1
backend_port  = xxx * 10 + 2
```

### Worked Example — "ai.lecture.show"

```
strip non-letters → "ailectureshow"
  a=1  i=9  l=12  e=5  c=3  t=20  u=21  r=18  e=5  s=19  h=8  o=15  w=23
sum = 159
xxx = (159 % 700) + 200 = 359   → not in SKIP → ok
frontend_port = 3591
backend_port  = 3592
```

### Apply to Vite (`frontend/vite.config.ts`)

```ts
server: {
  port: 3591,
  proxy: {
    '/api': { target: 'http://localhost:3592', changeOrigin: true }
  }
}
```

### Apply to Go (`backend/cmd/server/main.go`)

```go
port := os.Getenv("PORT")
if port == "" {
    port = "3592"
}
r.Run(":" + port)
```

### SKIP List Rationale

| xxx | Ports | Collides with |
|-----|-------|---------------|
| 300 | 3000/3001 | React CRA default |
| 500 | 5000/5001 | Flask/Python default |
| 800 | 8000/8001 | Django / HTTP-alt |
| 808 | 8080/8081 | Tomcat / Go common |

### Quick Reference

| Project | Letters | Sum | xxx | Frontend | Backend |
|---------|---------|-----|-----|----------|---------|
| ai.lecture.show | ailectureshow | 159 | 359 | 3591 | 3592 |
| cybertron.studio | cybertronstudio | 242 | 442 | 4421 | 4422 |
| my-app | myapp | 72 | 272 | 2721 | 2722 |
