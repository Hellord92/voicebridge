import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a12] gap-4 px-6 text-center">
          <p className="text-rose-400 font-semibold">Something went wrong</p>
          <p className="text-xs text-slate-500 max-w-xs">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-sm font-semibold"
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
