import { Navigate } from 'react-router-dom'
import { getStoredRole } from '../services/authService'
import { canWrite } from '../utils/permissions'

export default function WriteAccessRoute({ children }) {
  if (!canWrite(getStoredRole())) {
    return <Navigate to="/layouts" replace />
  }
  return children
}
