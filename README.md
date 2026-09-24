# zen-workslogs

A modern full-stack web application for tracking and displaying work logs with file upload capabilities. Built with React, Node.js, Express, and SQLite.

## 📋 Features

- **📝 Work Log Management**: Track and display work entries from HAVE_DONE.md files
- **📤 Smart Upload**: Upload and parse HAVE_DONE.md files with automatic date detection
- **🔍 Advanced Search**: Full-text search with filters, keyword highlighting, and date range selection
- **💾 Persistent Storage**: SQLite database for reliable data storage
- **🎨 Modern UI**: React frontend with Tailwind CSS and Lucide icons
- **🐳 Docker Support**: Easy deployment with Docker and Docker Compose
- **🔧 REST API**: Well-structured RESTful API with Express.js
- **📊 Statistics**: Track application usage and entry statistics

## 🏗️ Tech Stack

### Frontend
- **React 18** - Modern UI library
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Lucide React** - Beautiful icon library

### Backend
- **Node.js 18** - JavaScript runtime
- **Express.js** - Web framework
- **SQLite3** - Lightweight database
- **better-sqlite3** - Synchronous SQLite driver
- **Multer** - File upload handling
- **CORS** - Cross-origin resource sharing

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Git

### Clone and Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/borist-nababan-cloud/karunialogsapp.git
   cd karunialogsapp
   ```

2. **Install dependencies**
   ```bash
   # Install server dependencies
   npm install

   # Install client dependencies
   cd client
   npm install
   cd ..
   ```

3. **Start the application**
   ```bash
   # Development mode (with hot reload)
   npm run dev

   # Production mode
   npm run build
   npm start
   ```

4. **Access the application**
   - Frontend: http://localhost:5173 (Vite dev server)
   - Backend API: http://localhost:3000

## 🚀 Running with Docker

### Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Using Docker directly

```bash
# Build the image
docker build -t karunialogsapp .

# Run the container
docker run -p 3000:3000 -v $(pwd)/data:/app/data karunialogsapp
```

## 📁 Project Structure

```
karunialogsapp/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   │   ├── Display.jsx    # Main display page
│   │   │   ├── Upload.jsx     # File upload page
│   │   │   └── Files.jsx      # File management
│   │   ├── App.jsx        # Main app component
│   │   ├── main.jsx       # Entry point
│   │   └── index.css      # Global styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── server/                # Express backend
│   ├── routes/           # API routes
│   │   ├── upload.js
│   │   ├── entries.js
│   │   └── files.js
│   ├── server.js        # Main server file
│   ├── database.js      # Database configuration
│   └── parser.js        # Markdown parser
├── data/                 # SQLite database (persisted)
├── package.json          # Root package.json
├── Dockerfile           # Docker configuration
├── docker-compose.yml   # Docker Compose setup
└── .gitignore          # Git ignore rules
```

## 🔌 API Endpoints

### Health Check
- `GET /api/health` - Check API status

### Upload Management
- `POST /api/upload` - Upload HAVE_DONE.md files
- `POST /api/upload/parse` - Parse file without saving (preview)
- `GET /api/upload` - Get upload status

### Entries Management
- `GET /api/entries` - Get all log entries with filters
- `GET /api/entries/:id` - Get a single entry
- `GET /api/entries/stats/all` - Get application statistics
- `DELETE /api/entries/:id` - Delete entry

### Files Management
- `GET /api/files` - List all files
- `GET /api/files/:filename` - Download specific file

## 📄 HAVE_DONE.md Format

The parser expects the following markdown format (Indonesian):

```markdown
## Rabu, 8 Juli 2026
**Ringkasan:** Summary of work done...

### 📦 Modul yang Dibuat / Diperbarui
*   **Nama Modul:** `filename.pas`
    *   **Aksi:** Diperbarui
    *   **Detail Perubahan:** Details...

---

## 8 Juli 2026
**Ringkasan:** Another entry...
```

## 🗄️ Database

The application uses SQLite for data persistence with the following structure:

- **Entries Table**: Stores work log entries with timestamps
- **Files Table**: Tracks uploaded files
- **Database Location**: `./data/logs.db` (persisted in Docker volume)

## 🌐 Deployment

### Coolify Deployment

1. **Push your code to Git** (GitHub, GitLab, etc.)
2. **In Coolify**:
   - Create a new application
   - Select your Git repository
   - Set Docker Compose path: `docker-compose.yml`
   - Deploy!

3. **Environment Variables** (optional):
   - `NODE_ENV`: `production` (default)
   - `PORT`: `3000` (default)

4. **Persistent Storage**:
   - The SQLite database is stored in `/app/data` inside the container
   - Mount a volume to `./data` on the host to persist data
   - Data persists across container restarts

### Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=3000
```

## 🔒 Security Features

- **CORS Protection**: Configured for specific origins
- **File Type Validation**: Restricts upload to markdown files
- **GitIgnore Protection**: Sensitive files excluded from version control
  - Environment files (`.env`, `.env.local`)
  - SQL files (`*.sql`)
  - Credential directories (`docs/`, `my-cred/`, `database-docs/`)
  - Database files (`*.db`, `*.sqlite`)

## 🛠️ Development

### Available Scripts

```bash
# Start development server (backend + frontend)
npm run dev

# Start backend only
npm start

# Start frontend only
npm run client

# Build for production
npm run build

# Run with nodemon (auto-restart)
npm run dev
```

## 📝 Usage

### 1. Upload Page (`/upload`)

- Upload your `HAVE_DONE.md` file
- Preview parsed entries before confirming
- Smart merge: New entries are added, existing entries (by date) are updated
- View merge statistics after upload

### 2. Display Page (`/`)

- View all work log entries in reverse chronological order
- **Search**: Full-text search across summaries, modules, and details
- **Filters**:
  - Date range filter
  - Module name filter
  - Action type filter (Dibuat Baru vs Diperbarui)
- Expand/collapse entries for detailed view
- Keyword highlighting in search results

## 🔧 Troubleshooting

**Windows Build Error**: If you see `better-sqlite3` build errors locally, use Docker instead:
```bash
docker-compose up --build
```

**Database Empty After Restart**: Ensure the `data/` directory exists and is persisted:
```bash
# Check data directory
ls -la data/
```

**Coolify Deployment Fails**: Check Coolify logs for build errors. The most common issue is Git repository access.

## 📜 License

This project is proprietary software. All rights reserved.

## 👤 Author

**Boris Nababan Cloud**

- GitHub: [@borist-nababan-cloud](https://github.com/borist-nababan-cloud)

---

**Note**: This application is designed for internal work log tracking. Ensure sensitive data is properly protected and never committed to version control.
