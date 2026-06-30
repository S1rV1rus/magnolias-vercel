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
import { GiftCards } from './pages/GiftCards'
import { Settings } from './pages/Settings'
import { Logs } from './pages/Logs'
import { PriceList } from './pages/PriceList'
import { Blog } from './pages/Blog'
import { Stock } from './pages/Stock'
import { Metrics } from './pages/Metrics'
import { Accounting } from './pages/Accounting'

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
                                <Route path="gift-cards" element={<GiftCards />} />
                                <Route path="logs" element={<Logs />} />
                                <Route path="prices" element={<PriceList />} />
                                <Route path="blog" element={<Blog />} />
                                <Route path="stock" element={<Stock />} />

                                {/* Admin-only routes (Pilar) */}
                                <Route element={<ProtectedRoute adminOnly />}>
                                    <Route path="metrics" element={<Metrics />} />
                                    <Route path="accounting" element={<Accounting />} />
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
