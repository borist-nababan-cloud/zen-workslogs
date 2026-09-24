import { useState, useEffect } from 'react';
import { Search, Calendar, FileCode, TrendingUp, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function DisplayPage() {
  const [entries, setEntries] = useState([]);
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  const [stats, setStats] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchEntries();
    fetchStats();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [entries, search, dateFrom, dateTo, moduleFilter, actionFilter]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/entries`);
      setEntries(response.data.entries);
      setFilteredEntries(response.data.entries);
    } catch (error) {
      console.error('Failed to fetch entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/entries/stats/all`);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...entries];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.summary?.toLowerCase().includes(searchLower) ||
        entry.date_string?.toLowerCase().includes(searchLower) ||
        entry.modules?.some(mod =>
          mod.module_name?.toLowerCase().includes(searchLower) ||
          mod.details?.toLowerCase().includes(searchLower)
        )
      );
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter(entry => entry.date_iso >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(entry => entry.date_iso <= dateTo);
    }

    // Module filter
    if (moduleFilter) {
      filtered = filtered.filter(entry =>
        entry.modules?.some(mod =>
          mod.module_name?.toLowerCase().includes(moduleFilter.toLowerCase())
        )
      );
    }

    // Action filter
    if (actionFilter) {
      filtered = filtered.filter(entry =>
        entry.modules?.some(mod =>
          mod.action?.toLowerCase().includes(actionFilter.toLowerCase())
        )
      );
    }

    setFilteredEntries(filtered);
  };

  const clearFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setModuleFilter('');
    setActionFilter('');
  };

  const toggleEntry = (id) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedEntries(newExpanded);
  };

  const highlightText = (text, searchTerm) => {
    if (!searchTerm || !text) return text;

    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === searchTerm.toLowerCase() ? (
            <mark key={i} className="highlight">{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const getActionColor = (action) => {
    const lower = action?.toLowerCase() || '';
    if (lower.includes('baru') || lower.includes('baru')) return 'bg-green-100 text-green-800 border-green-200';
    if (lower.includes('update') || lower.includes('perbarui')) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const formatDate = (dateIso) => {
    const date = new Date(dateIso);
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Work Log Display</h1>
          <p className="text-gray-600 mt-1">View and search your work updates</p>
        </div>
        {stats && (
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border">
              <Calendar className="h-4 w-4 text-primary-600" />
              <span className="font-medium">{stats.totalEntries} entries</span>
            </div>
            <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border">
              <FileCode className="h-4 w-4 text-primary-600" />
              <span className="font-medium">{stats.totalModules} modules</span>
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search entries, modules, details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center space-x-2 btn-secondary min-w-[120px]"
          >
            <Filter className="h-5 w-5" />
            <span>Filters</span>
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Module Name</label>
              <input
                type="text"
                placeholder="e.g., FQQDPLeasing"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Action Type</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="input"
              >
                <option value="">All Actions</option>
                <option value="Dibuat Baru">Dibuat Baru</option>
                <option value="Diperbarui">Diperbarui</option>
              </select>
            </div>
            {(dateFrom || dateTo || moduleFilter || actionFilter) && (
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  onClick={clearFilters}
                  className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                  <span>Clear all filters</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results Info */}
      <div className="text-sm text-gray-600">
        Showing {filteredEntries.length} of {entries.length} entries
      </div>

      {/* Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="card text-center py-12">
          <FileCode className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No entries found</h3>
          <p className="text-gray-600">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="card">
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => toggleEntry(entry.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {highlightText(entry.date_string, search)}
                    </h3>
                    {entry.updated_at !== entry.created_at && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                        Updated
                      </span>
                    )}
                  </div>
                  {entry.summary && (
                    <p className="text-gray-700">
                      {highlightText(entry.summary, search)}
                    </p>
                  )}
                  {entry.modules && entry.modules.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.modules.map((mod, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-1 rounded-full border ${getActionColor(mod.action)}"
                        >
                          {mod.module_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  {expandedEntries.has(entry.id) ? (
                    <ChevronUp className="h-5 w-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-600" />
                  )}
                </button>
              </div>

              {/* Expanded Details */}
              {expandedEntries.has(entry.id) && entry.modules && entry.modules.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                  {entry.modules.map((mod, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-gray-900 font-mono text-sm">
                          {highlightText(mod.module_name, search)}
                        </h4>
                        <span className={`text-xs px-2 py-1 rounded-full border ${getActionColor(mod.action)}`}>
                          {mod.action}
                        </span>
                      </div>
                      {mod.details && (
                        <div className="text-sm text-gray-700 whitespace-pre-line">
                          {highlightText(mod.details, search)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DisplayPage;
