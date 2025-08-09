// src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; 
import { SnackbarProvider } from './components/snackbar';


const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
     <SnackbarProvider topOffset={56}>
      <App />
      </SnackbarProvider>
  </React.StrictMode>
);