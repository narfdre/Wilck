import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './views/Login'
import { Signup } from './views/Signup'
import { Dashboard } from './views/Dashboard'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
