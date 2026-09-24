import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Eye, Menu, X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import UploadPage from './pages/Upload';
import DisplayPage from './pages/Display';
import FilesPage from './pages/Files';
import axios from 'axios';

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const location = useLocation();

  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  const isActive = (path) => location.pathname === path;

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/files`);
      setFiles(response.data.files);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <div className="bg-primary-600 text-white p-2 rounded-lg">
                  <Eye className="h-6 w-6" />
                </div>
                <span className="text-xl font-bold text-gray-900">Zen Work Logs</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-4">
              <Link
                to="/"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive('/') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Eye className="h-5 w-5" />
                <span>Display</span>
              </Link>

              {/* File Downloads */}
              {files.map((file) => (
                <a
                  key={file.id}
                  href={`${API_BASE}/files/${file.id}/download`}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  download
                  title={`Download ${file.original_name}`}
                >
                  <Download className="h-5 w-5" />
                  <span className="hidden sm:inline">{file.original_name}</span>
                  <span className="sm:hidden">{file.original_name.substring(0, 15)}...</span>
                </a>
              ))}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-4 py-3 space-y-2">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive('/') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Eye className="h-5 w-5" />
                <span>Display</span>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<DisplayPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/files" element={<FilesPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-gray-500 text-sm">
            Zen Work Logs - HAVE_DONE.md Viewer • Built with React & SQLite
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
