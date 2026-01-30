import React, { useEffect } from 'react';
import { Route, Switch } from 'wouter';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import AdminDashboard from './components/AdminDashboard';
import DriverView from './components/DriverView';
import MainLayout from './components/MainLayout';
import DashboardHome from './components/DashboardHome';
import InventoryPage from './components/InventoryPage';

function App() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const configureStatusBar = async () => {
        try {
          await StatusBar.setStyle({ style: Style.Light });
          // Make status bar transparent (Overlay)
          if (Capacitor.getPlatform() === 'android') {
            await StatusBar.setOverlaysWebView({ overlay: true });
            await StatusBar.setBackgroundColor({ color: '#00000000' }); // Transparent
          }
        } catch (err) {
          console.warn('Status bar not available', err);
        }
      };
      configureStatusBar();
    }
  }, []);

  return (
    <Switch>
      {/* Driver View (Standalone - Full Screen) */}
      <Route path="/driver" component={DriverView} />
      <Route path="/driver/:routeId" component={DriverView} />

      {/* Admin Views (With Layout) */}
      <Route>
        <MainLayout>
          <Switch>
            <Route path="/" component={DashboardHome} />
            <Route path="/operations" component={AdminDashboard} />
            <Route path="/inventory" component={InventoryPage} />

            <Route path="/fleet">
              <div style={{ padding: '40px 60px' }}>
                <h1 style={{ color: '#f8fafc', fontSize: 28, fontWeight: 700 }}>🚚 Administración Vehicular</h1>
                <p style={{ color: '#94a3b8', marginTop: 10 }}>Gestión de vehículos y conductores (Próximamente)</p>
              </div>
            </Route>

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
      </Route>
    </Switch>
  );
}

export default App;
