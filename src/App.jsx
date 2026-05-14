import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from './layouts/AdminLayout'
import DashboardPage from './pages/Dashboard/DashboardPage'
import DeviceManagementPage from './pages/Device/DeviceManagementPage'
import LayoutEditorPage from './pages/Layout/LayoutEditorPage'
import LayoutManagementPage from './pages/Layout/LayoutManagementPage'
import MediaManagementPage from './pages/Media/MediaManagementPage'
import ScheduleManagementPage from './pages/Schedule/ScheduleManagementPage'
import LoginPage from './pages/Login/LoginPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/layouts" element={<LayoutManagementPage />} />
          <Route path="/layouts/editor" element={<LayoutEditorPage />} />
          <Route path="/devices" element={<DeviceManagementPage />} />
          <Route path="/media" element={<MediaManagementPage />} />
          <Route path="/schedules" element={<ScheduleManagementPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
