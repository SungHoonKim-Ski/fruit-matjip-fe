// src/index.tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SnackbarProvider } from './components/snackbar';
import App from './App';
import GATracker from './GATracker'; // 만약 쓰는 중이라면

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <BrowserRouter>
    <SnackbarProvider topOffset={56}>
      {/* useLocation 쓰는 모든 컴포넌트는 Router 안쪽에 */}
      <GATracker />
      <App />
    </SnackbarProvider>
  </BrowserRouter>
);