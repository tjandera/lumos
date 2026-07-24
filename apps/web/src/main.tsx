import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureFeatures } from '@interior/core';
import { FEATURES } from './flags';
import { initTelemetry } from './telemetry';
import { ErrorBoundary } from './ErrorBoundary';
import App from './App';
import './index.css';

initTelemetry();
configureFeatures(FEATURES);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
