// src/App.tsx 또는 src/index.tsx

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainPage from './pages/MainPage'; 

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* <Route path="/" element={<Navigate to="/auth/my-store-name" />} /> */}
        <Route path="/" element={<MainPage />} />
        {/* 다른 라우트들... */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
