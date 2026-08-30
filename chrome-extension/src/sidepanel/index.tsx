import React from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanel } from './SidePanel';
import './SidePanel.css';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(<SidePanel />);
}
