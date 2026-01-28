import React, { useEffect } from 'react';
import { Route, Switch } from 'wouter';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import AdminDashboard from './components/AdminDashboard';
import DriverView from './components/DriverView';

function App() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const configureStatusBar = async () => {
        try {
          await StatusBar.setStyle({ style: Style.Dark });
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
      <Route path="/" component={AdminDashboard} />
      <Route path="/driver/:routeId" component={DriverView} />

      {/* Fallback for unknown routes */}
      <Route>
        <div style={{
          height: '100vh', background: '#0f172a', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
        }}>
          <h2>404 - Página no encontrada</h2>
          <a href="/" style={{ color: '#3b82f6', marginTop: 10 }}>Volver al inicio</a>
        </div>
      </Route>
    </Switch>
  );
}

export default App;
