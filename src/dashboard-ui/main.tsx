import { createRoot } from 'react-dom/client';
import { DashboardApp } from './App.js';
import type { DashboardWindow } from './types.js';
import './styles.css';

const dashboardWindow = window as DashboardWindow;
const root = document.querySelector<HTMLElement>('[data-react-dashboard-root]');

if (root && dashboardWindow.__DOCPATH_DASHBOARD_DATA__) {
  createRoot(root).render(<DashboardApp data={dashboardWindow.__DOCPATH_DASHBOARD_DATA__} />);
}
