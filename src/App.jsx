import React, { useEffect, useState } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import AdminDashboard from './components/AdminDashboard';
import DriverView from './components/DriverView';
import TechnicianApp from './components/TechnicianApp';
import MainLayout from './components/MainLayout';
import DashboardHome from './components/DashboardHome';
import FleetManagement from './components/FleetManagement';
import InventoryPage from './components/InventoryPage';
import LoginPage from './components/LoginPage';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const configureStatusBar = async () => {
        try {
          await StatusBar.setStyle({ style: Style.Light });
          if (Capacitor.getPlatform() === 'android') {
            await StatusBar.setOverlaysWebView({ overlay: true });
            await StatusBar.setBackgroundColor({ color: '#00000000' });
          }
        } catch (err) {
          console.warn('Status bar not available', err);
        }
      };
      configureStatusBar();
    }
  }, []);

  const handleLoginSuccess = (userData, token) => {
    setUser(userData);
    setLocation('/');
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
    setLocation('/login');
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🚛</div>
          <p>Cargando TraceOps...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {/* Login Page */}
      <Route path="/login">
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </Route>

      {/* Driver View (Standalone - Full Screen, No Auth Required) */}
      <Route path="/driver" component={DriverView} />
      <Route path="/driver/:routeId" component={DriverView} />

      {/* Technician Mobile App (Standalone - Offline First) */}
      <Route path="/tecnico" component={TechnicianApp} />

      {/* Admin Views (With Layout - Auth Required) */}
      <Route>
        {!user ? (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        ) : (
          <MainLayout user={user} onLogout={handleLogout}>
            <Switch>
              <Route path="/" component={DashboardHome} />
              <Route path="/operations" component={AdminDashboard} />
              <Route path="/inventory" component={InventoryPage} />

              <Route path="/fleet" component={FleetManagement} />

              <Route path="/calls">
                <div style={{ padding: '40px 60px' }}>
                  <h1 style={{ color: '#f8fafc', fontSize: 28, fontWeight: 700 }}>📞 Centro de Llamadas</h1>
                  <p style={{ color: '#94a3b8', marginTop: 10 }}>Historial y gestión de llamadas (Próximamente)</p>
                </div>
              </Route>

              {/* Fallback 404 within Layout */}
              <Route>
                <div style={{
                  height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8'
                }}>
                  <h2 style={{ color: '#f8fafc' }}>404 - Página no encontrada</h2>
                  <a href="/" style={{ color: '#10b981', marginTop: 10 }}>Volver al Panel Principal</a>
                </div>
              </Route>
            </Switch>
          </MainLayout>
        )}
      </Route>
    </Switch>
  );
}

export default App;
