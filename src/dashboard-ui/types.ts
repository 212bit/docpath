import type { DashboardData } from '../commands/dashboard.js';

export type { DashboardData };

export type DashboardWindow = Window & {
  __DOCPATH_DASHBOARD_DATA__?: DashboardData;
};
