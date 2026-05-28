# Implementation Plan: Open Cell

Open Cell is a TypeScript-based web server for collaborative Excel file editing.

## 1. Technical Stack

- **Backend:** Node.js, Express, TypeScript
- **Frontend:** TypeScript, HTML/CSS (Vanilla or React - *to be confirmed*)
- **Excel Handling:** `exceljs` or `xlsx`
- **Concurrency:** Simple state management on server + 5-second polling on client

## 2. Project Structure

```text
open-cell/
├── src/
│   ├── backend/
│   │   ├── server.ts      # Express server & API routes
│   │   ├── excel.ts       # Excel file operations (read/write/backup)
│   │   └── state.ts       # In-memory state for active sessions
│   └── frontend/
│       ├── index.html
│       ├── main.ts        # UI logic & polling
│       └── styles.css
├── data/                  # Target Excel files
├── package.json
├── tsconfig.json
└── PLAN.md
```

## 3. Development Phases

### Phase 1: Setup & Basic API

- Initialize Node.js project with TypeScript.
- Set up Express server.
- Implement `GET /api/files`: List `.xlsx` files in `data/` folder.
- Implement `GET /api/files/:name/sheets`: List sheets in a specific file.

### Phase 2: Sheet Data & Rendering

- Implement `GET /api/files/:name/sheets/:sheet`: Return sheet content as JSON.
- Create frontend grid to display sheet data.
- Basic navigation between files and sheets.

### Phase 3: Editing & Polling

- Implement `POST /api/files/:name/sheets/:sheet/edit`: Update cell content in memory/temp state.
- Implement client-side 5-second polling to fetch latest data.
- Basic concurrency: Track "last modified" timestamp per cell/sheet.

### Phase 4: Conflict Resolution

- Detect conflicts when polling (server data differs from local uncommitted changes).
- Implement UI dialog for user to choose between "Local", "Server", or "Manual Merge".

### Phase 5: Saving & Backup

- Implement `POST /api/save`: Commit memory changes to the physical Excel file.
- Logic for backup: Before saving `data/file.xlsx`, copy to `data/file/YYYYMMDDHHMMSS.xlsx`.
