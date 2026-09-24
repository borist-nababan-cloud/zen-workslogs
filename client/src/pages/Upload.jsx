import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function UploadPage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile) => {
    // Reset state
    setError(null);
    setResult(null);
    setPreview(null);

    // Validate file type
    const validTypes = ['.md', '.txt'];
    const fileExt = '.' + selectedFile.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(fileExt)) {
      setError('Please select a .md or .txt file');
      return;
    }

    // Validate file size (5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setFile(selectedFile);
  };

  const handlePreview = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE}/upload/parse`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setPreview(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to parse file');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setResult(response.data);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Work Log</h1>
        <p className="text-gray-600 mt-1">Upload your HAVE_DONE.md file to update the work log</p>
      </div>

      {/* Upload Area */}
      <div className="card">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {!file ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <Upload className="h-16 w-16 text-gray-400" />
              </div>
              <div>
                <p className="text-lg font-medium text-gray-900">
                  Drag and drop your HAVE_DONE.md file here
                </p>
                <p className="text-gray-600 mt-1">or</p>
              </div>
              <label className="btn-primary inline-block cursor-pointer">
                Browse Files
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              <p className="text-sm text-gray-500">Supported formats: .md, .txt (max 5MB)</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="h-10 w-10 text-primary-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <div className="flex justify-center space-x-4">
                <button
                  onClick={handlePreview}
                  disabled={uploading}
                  className="btn-secondary flex items-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Parsing...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-5 w-5" />
                      <span>Preview</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="btn-primary flex items-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span>Upload & Process</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-900">Error</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Preview</h3>
            <span className="text-sm text-gray-600">{preview.count} entries found</span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {preview.entries.map((entry, idx) => (
              <div key={idx} className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">{entry.date_string}</h4>
                {entry.summary && (
                  <p className="text-sm text-gray-700 mt-1">{entry.summary}</p>
                )}
                {entry.modules && entry.modules.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {entry.modules.map((mod, modIdx) => (
                      <div key={modIdx} className="text-xs text-gray-600">
                        <span className="font-mono">{mod.module_name}</span>
                        <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                          {mod.action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end space-x-3">
            <button
              onClick={() => setPreview(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="btn-primary flex items-center space-x-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm Upload</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card bg-green-50 border-green-200">
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-green-900">Upload Successful!</h3>
              <p className="text-green-700 mt-1">{result.message}</p>

              <div className="mt-4 bg-white rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Merge Statistics</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary-600">{result.stats.total}</p>
                    <p className="text-sm text-gray-600">Total Entries</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{result.stats.added}</p>
                    <p className="text-sm text-gray-600">Added</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{result.stats.updated}</p>
                    <p className="text-sm text-gray-600">Updated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-600">{result.stats.unchanged}</p>
                    <p className="text-sm text-gray-600">Unchanged</p>
                  </div>
                </div>
              </div>

              {result.preview && result.preview.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setPreview({ entries: result.preview, count: result.preview.length });
                      setResult(null);
                    }}
                    className="text-sm text-primary-600 hover:text-primary-700 underline"
                  >
                    View preview of uploaded entries
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Upload your HAVE_DONE.md file to parse and store entries</li>
          <li>• The system uses smart merge: new entries are added, existing entries (by date) are updated</li>
          <li>• Preview before confirming to see what will be imported</li>
          <li>• View all entries on the Display page with search and filters</li>
        </ul>
      </div>
    </div>
  );
}

export default UploadPage;
