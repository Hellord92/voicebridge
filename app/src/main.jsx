import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ModalProvider } from './components/ui/ModalProvider.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ModalProvider>
      <App />
    </ModalProvider>
  </ErrorBoundary>
);
