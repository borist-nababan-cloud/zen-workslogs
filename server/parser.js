/**
 * Parser for HAVE_DONE.md format
 * Parses Indonesian markdown logs with entries containing dates, summaries, and module updates
 */

// Indonesian month names mapping
const indonesianMonths = {
  'Januari': 1, 'Februari': 2, 'Maret': 3, 'April': 4, 'Mei': 5, 'Juni': 6,
  'Juli': 7, 'Agustus': 8, 'September': 9, 'Oktober': 10, 'November': 11, 'Desember': 12
};

/**
 * Parse Indonesian date string to ISO format
 */
function parseIndonesianDate(dateString) {
  // Remove markdown heading and clean up
  let cleaned = dateString.replace(/^##\s*/, '').trim();
  // Remove parenthetical suffixes like "(Sesi 2)"
  cleaned = cleaned.replace(/\s*\(.*?\)\s*$/, '').trim();

  // Match patterns
  const patterns = [
    /(\w+),\s*(\d{1,2})\s+(\w+)\s+(\d{4})/,
    /(\d{1,2})\s+(\w+)\s+(\d{4})/,
    /Tanggal Update:\s*(\d{1,2})\s+(\w+)\s+(\d{4})/
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let day, monthName, year;
      if (match.length === 5) {
        [, , day, monthName, year] = match;
      } else if (match.length === 4) {
        [, day, monthName, year] = match;
      }

      const month = indonesianMonths[monthName];
      if (month) {
        const date_iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { date_string: cleaned, date_iso };
      }
    }
  }
  return null;
}

/**
 * Parse HAVE_DONE.md content
 */
function parseHAVE_DONE(markdown) {
  const entries = [];
  const lines = markdown.split('\n');

  let currentEntry = null;
  let inModules = false;
  let currentModule = null;
  let summaryParts = [];
  let moduleDetails = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for date header (## pattern) - new entry
    if (trimmed.startsWith('## ')) {
      // Save previous entry
      if (currentEntry) {
        if (summaryParts.length > 0) {
          currentEntry.summary = summaryParts.join('\n').trim();
        }
        if (currentModule && moduleDetails.length > 0) {
          currentModule.details = moduleDetails.join('\n').trim();
          currentEntry.modules.push(currentModule);
        }
        entries.push(currentEntry);
      }

      // Start new entry
      const headerText = trimmed.replace(/^##\s*/, '').trim();
      const dateInfo = parseIndonesianDate(headerText);

      if (dateInfo) {
        currentEntry = {
          date_string: dateInfo.date_string,
          date_iso: dateInfo.date_iso,
          summary: '',
          modules: []
        };
      }
      inModules = false;
      currentModule = null;
      summaryParts = [];
      moduleDetails = [];
      continue;
    }

    if (!currentEntry) continue;

    // Check for separator
    if (trimmed === '---') {
      inModules = false;
      // Save any pending module
      if (currentModule && moduleDetails.length > 0) {
        currentModule.details = moduleDetails.join('\n').trim();
        currentEntry.modules.push(currentModule);
        currentModule = null;
        moduleDetails = [];
      }
      continue;
    }

    // Check for modules section header
    if (trimmed.includes('Modul') &&
        (trimmed.includes('yang Dibuat') || trimmed.includes('yang Diperbarui'))) {
      inModules = true;
      // Save any accumulated summary
      if (summaryParts.length > 0 && !currentEntry.summary) {
        currentEntry.summary = summaryParts.join('\n').trim();
        summaryParts = [];
      }
      continue;
    }

    // Handle numbered module format: ### 1. Modul Laporan...
    if (trimmed.match(/^###\s*\d+\.\s+Modul/)) {
      inModules = true;
      // Save any accumulated summary
      if (summaryParts.length > 0 && !currentEntry.summary) {
        currentEntry.summary = summaryParts.join('\n').trim();
        summaryParts = [];
      }
      // Don't continue - let the module parsing handle this line
    }

    // Process modules
    if (inModules) {
      // Check for new module (bullet point or numbered)
      if (trimmed.match(/^\*\s+\*\*Nama Modul:\*\*/) || trimmed.match(/^###\s*\d+\.\s+Modul/)) {
        // Save previous module
        if (currentModule) {
          if (moduleDetails.length > 0) {
            currentModule.details = moduleDetails.join('\n').trim();
          }
          if (currentModule.module_name || currentModule.details) {
            currentEntry.modules.push(currentModule);
          }
          moduleDetails = [];
        }

        // Parse new module
        let moduleName, action = 'Diperbarui';

        if (trimmed.match(/^\*\s+\*\*Nama Modul:\*\*/)) {
          // Format: *   **Nama Modul:** `filename`
          const nameMatch = trimmed.match(/\*{2}Nama Modul:\*{2}\s*([^\n]+)/);
          moduleName = nameMatch ? nameMatch[1].trim().replace(/`/g, '') : '';
        } else if (trimmed.match(/^###\s*\d+\.\s*Modul/)) {
          // Format: ### 1. Modul Laporan (`FViewPengiriman`)
          const nameMatch = trimmed.match(/`([^`]+)`/);
          moduleName = nameMatch ? nameMatch[1] : trimmed.replace(/^###\s*\d+\.\s*/, '').trim();
        }

        currentModule = { module_name: moduleName, action, details: '' };
      } else if (currentModule) {
        // Check for action line
        if (trimmed.match(/^\*\s+\*\*Aksi:\*\*/)) {
          const actionMatch = trimmed.match(/\*{2}Aksi:\*{2}\s*([^\n]+)/);
          if (actionMatch) {
            currentModule.action = actionMatch[1].trim();
          }
        }
        // Check for details line
        else if (trimmed.match(/^\*\s+\*\*Detail/)) {
          const detailText = trimmed.replace(/^\*\s+\*\*Detail[^:]*:\*\*\s*/, '').trim();
          if (detailText) {
            moduleDetails.push(detailText);
          }
        }
        // Bullet points or numbered lists in details
        else if (trimmed.startsWith('-') || trimmed.match(/^\d+\./)) {
          moduleDetails.push(trimmed);
        }
        // Other non-empty content
        else if (trimmed.length > 0 && !trimmed.startsWith('**')) {
          moduleDetails.push(trimmed);
        }
      }
    } else {
      // Not in modules section - collect summary
      if (trimmed.startsWith('**Ringkasan:**')) {
        const summaryText = trimmed.replace(/\*{2}Ringkasan:\*{2}\s*/, '').trim();
        if (summaryText) {
          summaryParts.push(summaryText);
        }
      } else if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        summaryParts.push(trimmed);
      }
    }
  }

  // Don't forget the last entry
  if (currentEntry) {
    if (summaryParts.length > 0) {
      currentEntry.summary = summaryParts.join('\n').trim();
    }
    if (currentModule && moduleDetails.length > 0) {
      currentModule.details = moduleDetails.join('\n').trim();
      currentEntry.modules.push(currentModule);
    }
    entries.push(currentEntry);
  }

  return entries;
}

/**
 * Smart merge parsed entries with database
 */
function smartMergeEntries(parsedEntries, dbHelpers) {
  let added = 0, updated = 0, unchanged = 0;

  parsedEntries.forEach(entry => {
    const existing = dbHelpers.getEntryByDate(entry.date_string);

    if (existing) {
      dbHelpers.upsertEntry(entry.date_string, entry.date_iso, entry.summary);
      const entryId = dbHelpers.getEntryIdByDate(entry.date_string);
      dbHelpers.deleteModulesForEntry(entryId);
      entry.modules.forEach(module => {
        dbHelpers.insertModule(entryId, module.module_name, module.action, module.details);
      });
      updated++;
    } else {
      dbHelpers.upsertEntry(entry.date_string, entry.date_iso, entry.summary);
      const entryId = dbHelpers.getEntryIdByDate(entry.date_string);
      entry.modules.forEach(module => {
        dbHelpers.insertModule(entryId, module.module_name, module.action, module.details);
      });
      added++;
    }
  });

  return { total: parsedEntries.length, added, updated, unchanged };
}

module.exports = {
  parseHAVE_DONE,
  parseIndonesianDate,
  smartMergeEntries
};
