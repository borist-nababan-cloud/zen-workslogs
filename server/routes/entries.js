const express = require('express');
const router = express.Router();

/**
 * GET /api/entries
 * Get all entries with optional filters
 * Query params: search, dateFrom, dateTo, module, action
 */
router.get('/', (req, res) => {
  try {
    const dbHelpers = req.app.get('dbHelpers');
    const { search, dateFrom, dateTo, module, action } = req.query;

    const filters = {};
    if (search) filters.search = search;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (module) filters.module = module;
    if (action) filters.action = action;

    // If no filters, get all entries
    const entries = Object.keys(filters).length === 0
      ? dbHelpers.getAllEntries()
      : dbHelpers.searchEntries(filters);

    res.json({
      success: true,
      count: entries.length,
      entries
    });

  } catch (error) {
    console.error('Entries fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

/**
 * GET /api/entries/:id
 * Get a single entry by ID
 */
router.get('/:id', (req, res) => {
  try {
    const dbHelpers = req.app.get('dbHelpers');
    const db = req.app.get('db');

    const entryStmt = db.prepare('SELECT * FROM entries WHERE id = ?');
    const entry = entryStmt.get(req.params.id);

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const modulesStmt = db.prepare('SELECT * FROM modules WHERE entry_id = ? ORDER BY id');
    entry.modules = modulesStmt.all(entry.id);

    res.json({
      success: true,
      entry
    });

  } catch (error) {
    console.error('Entry fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
});

/**
 * GET /api/stats
 * Get application statistics
 */
router.get('/stats/all', (req, res) => {
  try {
    const dbHelpers = req.app.get('dbHelpers');
    const stats = dbHelpers.getStats();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * DELETE /api/entries/:id
 * Delete an entry
 */
router.delete('/:id', (req, res) => {
  try {
    const db = req.app.get('db');

    const stmt = db.prepare('DELETE FROM entries WHERE id = ?');
    const result = stmt.run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({
      success: true,
      message: 'Entry deleted successfully'
    });

  } catch (error) {
    console.error('Entry delete error:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

module.exports = router;
