import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Event from './routes/Event';
import Group from './routes/Group';
import Map from './routes/Map';
import './input.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/event/:id" element={<Event />} />
        <Route path="/group/:id" element={<Group />} />
        <Route path="/map" element={<Map />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
