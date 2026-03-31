import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ThemeProvider } from './providers/ThemeProvider'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Appointments } from './pages/Appointments'
import { Patients } from './pages/Patients'
import { PatientDetails } from './pages/Patients/PatientDetails'
import { Coupons } from './pages/Coupons'
import { Settings } from './pages/Settings'
import { Logs } from './pages/Logs'

function App() {
    return (
        <ThemeProvider defaultTheme="light">
            <AuthProvider>
                <Router>
                    <Routes>
                        {/* Public routes */}
                        <Route path="/login" element={<Login />} />

                        {/* Protected routes (any authenticated user) */}
                        <Route element={<ProtectedRoute />}>
                            <Route path="/" element={<Layout />}>
                                <Route index element={<Home />} />
                                <Route path="appointments" element={<Appointments />} />
                                <Route path="patients">
                                    <Route index element={<Patients />} />
                                    <Route path=":id" element={<PatientDetails />} />
                                </Route>
                                <Route path="coupons" element={<Coupons />} />
                                <Route path="logs" element={<Logs />} />

                                {/* Admin-only route */}
                                <Route element={<ProtectedRoute adminOnly />}>
                                    <Route path="settings" element={<Settings />} />
                                </Route>
                            </Route>
                        </Route>
                    </Routes>
                </Router>
            </AuthProvider>
        </ThemeProvider>
    )
}

export default App
