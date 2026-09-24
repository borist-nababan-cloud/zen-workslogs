const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, dbHelpers } = require('./database');
const uploadRoutes = require('./routes/upload');
const entriesRoutes = require('./routes/entries');
const filesRoutes = require('./routes/files');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make db and dbHelpers available to routes
app.set('db', db);
app.set('dbHelpers', dbHelpers);

// API Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/files', filesRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'client/dist');
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});

module.exports = app;
