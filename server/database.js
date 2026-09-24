const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path - store in data directory for persistence
const dbDir = path.join(__dirname, '../data');
const dbPath = path.join(dbDir, 'logsupdate.db');

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  // Create entries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_string TEXT NOT NULL,
      date_iso TEXT NOT NULL,
      summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date_string)
    )
  `);

  // Create modules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      module_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entries_date_iso ON entries(date_iso DESC);
    CREATE INDEX IF NOT EXISTS idx_modules_entry_id ON modules(entry_id);
    CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(module_name);
  `);

  // Create files table for EXE/zip/apk uploads
  // Dropping existing table because we are changing schema and data is disposable
  db.exec(`DROP TABLE IF EXISTS files`);
  db.exec(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      upload_date TEXT DEFAULT CURRENT_TIMESTAMP,
      app_category TEXT UNIQUE NOT NULL
    )
  `);

  console.log('Database initialized successfully');

  console.log('Database initialized successfully');
}

// Initialize on first load
initializeDatabase();

// Database helper functions
const dbHelpers = {
  // Insert or update an entry
  upsertEntry: (dateString, dateIso, summary) => {
    const stmt = db.prepare(`
      INSERT INTO entries (date_string, date_iso, summary)
      VALUES (?, ?, ?)
      ON CONFLICT(date_string) DO UPDATE SET
        summary = excluded.summary,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(dateString, dateIso, summary);
  },

  // Get entry by date string
  getEntryByDate: (dateString) => {
    return db.prepare('SELECT * FROM entries WHERE date_string = ?').get(dateString);
  },

  // Get entry ID by date string
  getEntryIdByDate: (dateString) => {
    const entry = db.prepare('SELECT id FROM entries WHERE date_string = ?').get(dateString);
    return entry ? entry.id : null;
  },

  // Delete modules for an entry
  deleteModulesForEntry: (entryId) => {
    return db.prepare('DELETE FROM modules WHERE entry_id = ?').run(entryId);
  },

  // Insert a module
  insertModule: (entryId, moduleName, action, details) => {
    const stmt = db.prepare(`
      INSERT INTO modules (entry_id, module_name, action, details)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(entryId, moduleName, action, details);
  },

  // Get all entries with modules
  getAllEntries: () => {
    const entriesStmt = db.prepare(`
      SELECT * FROM entries ORDER BY date_iso DESC
    `);
    const entries = entriesStmt.all();

    // Get modules for each entry
    const modulesStmt = db.prepare(`
      SELECT * FROM modules WHERE entry_id = ? ORDER BY id
    `);

    return entries.map(entry => ({
      ...entry,
      modules: modulesStmt.all(entry.id)
    }));
  },

  // Search entries with filters
  searchEntries: ({ search, dateFrom, dateTo, module, action }) => {
    let query = `
      SELECT DISTINCT e.* FROM entries e
      LEFT JOIN modules m ON e.id = m.entry_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (
        e.summary LIKE ? OR
        e.date_string LIKE ? OR
        m.module_name LIKE ? OR
        m.details LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (dateFrom) {
      query += ` AND e.date_iso >= ?`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND e.date_iso <= ?`;
      params.push(dateTo);
    }

    if (module) {
      query += ` AND m.module_name LIKE ?`;
      params.push(`%${module}%`);
    }

    if (action) {
      query += ` AND m.action LIKE ?`;
      params.push(`%${action}%`);
    }

    query += ` ORDER BY e.date_iso DESC`;

    const entriesStmt = db.prepare(query);
    const entries = entriesStmt.all(...params);

    // Get modules for filtered entries
    const modulesStmt = db.prepare(`
      SELECT * FROM modules WHERE entry_id = ? ORDER BY id
    `);

    return entries.map(entry => ({
      ...entry,
      modules: modulesStmt.all(entry.id)
    }));
  },

  // Get statistics
  getStats: () => {
    const totalEntries = db.prepare('SELECT COUNT(*) as count FROM entries').get();
    const totalModules = db.prepare('SELECT COUNT(*) as count FROM modules').get();
    const latestEntry = db.prepare('SELECT date_iso FROM entries ORDER BY date_iso DESC LIMIT 1').get();
    const actionCounts = db.prepare('SELECT action, COUNT(*) as count FROM modules GROUP BY action').all();

    return {
      totalEntries: totalEntries.count,
      totalModules: totalModules.count,
      latestEntry: latestEntry ? latestEntry.date_iso : null,
      actionCounts
    };
  },

  // File management helpers
  getAllFiles: () => {
    return db.prepare('SELECT * FROM files ORDER BY upload_date DESC').all();
  },

  getFileById: (id) => {
    return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  },

  getFileByFilename: (filename) => {
    return db.prepare('SELECT * FROM files WHERE filename = ?').get(filename);
  },

  upsertFile: (filename, originalName, mimeType, size, appCategory) => {
    const stmt = db.prepare(`
      INSERT INTO files (filename, original_name, mime_type, size, app_category)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(app_category) DO UPDATE SET
        filename = excluded.filename,
        original_name = excluded.original_name,
        mime_type = excluded.mime_type,
        size = excluded.size,
        upload_date = CURRENT_TIMESTAMP
    `);
    return stmt.run(filename, originalName, mimeType, size, appCategory);
  },

  deleteFile: (id) => {
    return db.prepare('DELETE FROM files WHERE id = ?').run(id);
  }
};

module.exports = { db, dbHelpers };
