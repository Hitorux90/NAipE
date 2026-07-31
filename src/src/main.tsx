// src/src/main.tsx — React entry point for New ApE.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App';

async function bootstrap() {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');

  // Verify IPC wiring against the Rust scaffold.
  try {
    const reply = await invoke<string>('greet', { name: 'Sprint 1' });
    console.log('[IPC]', reply);
  } catch (err) {
    console.warn('[IPC] greet command failed:', err);
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap New ApE frontend:', err);
});
