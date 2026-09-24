import { useState, useEffect } from 'react';
import { Upload, Download, Trash2, FileArchive, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function FilesPage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

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

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      setError('Only .zip files are allowed');
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

    try {
      const response = await axios.post(`${API_BASE}/files/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSuccess('File uploaded successfully! Old files with the same name were replaced.');
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">File Management</h1>
        <p className="text-gray-600 mt-1">Upload and manage application files (.zip)</p>
      </div>

      {/* Upload Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload New File</h2>
        <div className="flex items-center space-x-4">
          <label className="btn-primary cursor-pointer">
            <FileArchive className="h-5 w-5 inline mr-2" />
            Select .zip File
            <input
              type="file"
              accept=".zip"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          {uploading && (
            <span className="text-gray-600">Uploading...</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-2">Max file size: 150MB. Replaces existing files with the same name.</p>
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

      {/* Files List */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Files</h2>
        {files.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No files uploaded yet</p>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <FileArchive className="h-8 w-8 text-primary-600" />
                  <div>
                    <p className="font-medium text-gray-900">{file.original_name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(file.size)} • Uploaded {new Date(file.upload_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <a
                    href={`${API_BASE}/files/${file.id}/download`}
                    className="btn-secondary flex items-center space-x-2"
                    download
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </a>
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Upload .zip files containing your application builds</li>
          <li>• Files appear as download links in the main navigation</li>
          <li>• Uploading a file with the same name replaces the old version</li>
          <li>• Access this page manually: /files</li>
        </ul>
      </div>
    </div>
  );
}

export default FilesPage;
