import { useState, useEffect } from 'react';
import { Download, Trash2, FileArchive, AlertCircle, Monitor, RefreshCw, Smartphone, Users } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const APP_CATEGORIES = [
  { id: 'zen_desktop', name: 'Zen Desktop System', ext: '.zip', icon: Monitor },
  { id: 'zen_sync', name: 'Zen Sync App', ext: '.zip', icon: RefreshCw },
  { id: 'internal_android', name: 'Internal Android App', ext: '.apk', icon: Smartphone },
  { id: 'customer_android', name: 'Customer Test Android App', ext: '.apk', icon: Users },
];

function FilesPage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(APP_CATEGORIES[0].id);

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

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const categoryDef = APP_CATEGORIES.find(c => c.id === selectedCategory);
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith(categoryDef.ext)) {
      setError(`For ${categoryDef.name}, please upload a ${categoryDef.ext} file`);
      return;
    }

    // Validate file size (150MB)
    if (file.size > 150 * 1024 * 1024) {
      setError('File size must be less than 150MB');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('app_category', selectedCategory);

    try {
      await axios.post(`${API_BASE}/files/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSuccess(`${categoryDef.name} uploaded successfully!`);
      fetchFiles();
      e.target.value = '';
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await axios.delete(`${API_BASE}/files/${id}`);
      setSuccess('File deleted successfully');
      fetchFiles();
    } catch (err) {
      setError('Failed to delete file');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Map files to categories for easy display
  const getFileForCategory = (categoryId) => {
    return files.find(f => f.app_category === categoryId);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Release Hub</h1>
        <p className="text-gray-600 mt-1">Manage and download the latest application builds for Zen System.</p>
      </div>

      {/* Upload Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload New Release</h2>
        
        <div className="flex flex-col sm:flex-row sm:items-end space-y-4 sm:space-y-0 sm:space-x-4 mb-4">
          <div className="flex-1">
            <label className="label">Target Application</label>
            <select 
              className="input bg-gray-50"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={uploading}
            >
              {APP_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name} ({cat.ext})</option>
              ))}
            </select>
          </div>
          
          <div className="flex-shrink-0">
            <label className={`btn-primary cursor-pointer flex items-center justify-center ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <FileArchive className="h-5 w-5 inline mr-2" />
              {uploading ? 'Uploading...' : 'Select File to Upload'}
              <input
                type="file"
                accept={APP_CATEGORIES.find(c => c.id === selectedCategory)?.ext}
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        </div>
        <p className="text-sm text-gray-500">Max file size: 150MB. Uploading a new file will replace the current version for that specific application.</p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}
      {success && (
        <div className="card bg-green-50 border-green-200">
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Files List / Hub */}
      <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Latest Versions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {APP_CATEGORIES.map(category => {
          const file = getFileForCategory(category.id);
          const Icon = category.icon;
          
          return (
            <div key={category.id} className="card flex flex-col h-full border-l-4 border-l-primary-500">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{category.name}</h3>
                    <p className="text-sm text-gray-500">{category.ext} format</p>
                  </div>
                </div>
                {file && (
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
                    title="Delete this version"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>

              <div className="flex-grow">
                {file ? (
                  <div className="bg-gray-50 rounded p-3 mb-4 border border-gray-100">
                    <p className="text-sm font-medium text-gray-800 truncate" title={file.original_name}>
                      {file.original_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatFileSize(file.size)} • Uploaded {new Date(file.upload_date).toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded p-3 mb-4 border border-gray-100 border-dashed flex items-center justify-center h-[76px]">
                    <p className="text-sm text-gray-500 italic">No version uploaded yet</p>
                  </div>
                )}
              </div>

              <div>
                <a
                  href={file ? `${API_BASE}/files/${file.id}/download` : '#'}
                  className={`flex items-center justify-center w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                    file 
                      ? 'bg-primary-600 hover:bg-primary-700 text-white' 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  download={file ? true : undefined}
                  onClick={(e) => {
                    if (!file) e.preventDefault();
                  }}
                >
                  <Download className="h-5 w-5 mr-2" />
                  {file ? 'Download Latest' : 'Not Available'}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FilesPage;
