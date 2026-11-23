import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Error diserap secara aman agar rincian internal tidak bocor ke console produksi
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zen-linen flex items-center justify-center p-4">
          <div className="card max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center border border-red-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zen-charcoal">
                Terjadi Kesalahan Tampilan
              </h1>
              <p className="text-sm text-zen-charcoal/70 mt-1">
                Aplikasi mengalami kendala tak terduga. Silakan muat ulang halaman untuk melanjutkan.
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-primary inline-flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
