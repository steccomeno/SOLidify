// Import polyfills first
import './setupPolyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Create root and render
const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// We don't use reportWebVitals in this version
console.log('SOLidify application started'); 