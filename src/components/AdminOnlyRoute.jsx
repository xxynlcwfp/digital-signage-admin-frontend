import { Navigate } from 'react-router-dom'
import { canManageUsers } from '../services/authService'

export default function AdminOnlyRoute({ children }) {
  if (!canManageUsers()) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}
