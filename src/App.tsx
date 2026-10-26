import { useEffect } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { DatesProvider } from '@mantine/dates';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { theme } from './theme';
import { requestPersistence } from './db/db';
import { Shell } from './components/Shell';
import { DashboardPage } from './pages/Dashboard';
import { ProjectsPage } from './pages/Projects';
import { ProjectPage } from './pages/project/ProjectPage';
import { BillingPage } from './pages/Billing';
import { LabInvoicesPage } from './pages/LabInvoices';
import { CalendarPage } from './pages/Calendar';
import { ImportPage } from './pages/Import';
import { SettingsPage } from './pages/Settings';
import { PeoplePage } from './pages/People';

export function App() {
  useEffect(() => {
    void requestPersistence();
  }, []);
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ firstDayOfWeek: 1, locale: 'en' }}>
        <ModalsProvider>
          <Notifications position="top-right" />
          <HashRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:id/*" element={<ProjectPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/billing/:month" element={<BillingPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/lab-invoices" element={<LabInvoicesPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/calendar/:year" element={<CalendarPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
