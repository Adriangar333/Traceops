/**
 * Technician Login Component
 * Simple login for field technicians to authenticate and get their assigned orders
 */

import { useState } from 'react';
import { dbService } from '../services/DatabaseService';
import { syncService } from '../services/SyncService';
import { User, Lock, LogIn, AlertCircle, Loader } from 'lucide-react';

const API_BASE = 'https://dashboard-backend.zvkdyr.easypanel.host/api';

export default function TechnicianLogin({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!email || !password) {
            setError('Ingrese email y contraseña');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Try online login first
            if (syncService.isOnline) {
                const response = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || 'Credenciales inválidas');
                }

                const data = await response.json();

                // Save token and user info
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                // Save to local DB for offline access
                await dbService.init();
                await dbService.setState('user', data.user);
                await dbService.setState('lastLogin', new Date().toISOString());

                // Initial sync of orders
                await syncService.downloadOrders(data.user.id);

                onLoginSuccess(data.user);

            } else {
                // Offline login - check local DB
                await dbService.init();
                const savedUser = await dbService.getState('user');

                if (savedUser && savedUser.email === email) {
                    // Allow offline access with cached credentials
                    console.log('🔓 Offline login with cached user');
                    onLoginSuccess(savedUser);
                } else {
                    throw new Error('Sin conexión. Inicie sesión online primero.');
                }
            }

        } catch (err) {
            console.error('Login error:', err);
            setError(err.message || 'Error de autenticación');
        } finally {
            setIsLoading(false);
        }
    };

    // Quick demo login
    const handleDemoLogin = async () => {
        setEmail('tecnico@traceops.com');
        setPassword('tecnico123');

        // Simulate login for demo
        const demoUser = {
            id: 100,
            email: 'tecnico@traceops.com',
            name: 'Técnico Demo',
            role: 'technician'
        };

        await dbService.init();
        await dbService.setState('user', demoUser);

        onLoginSuccess(demoUser);
    };

    return (
        <div style={styles.container}>
            <div style={styles.logoSection}>
                <div style={styles.logo}>⚡</div>
                <h1 style={styles.appName}>TraceOps</h1>
                <p style={styles.tagline}>Field Service Mobile</p>
            </div>

            <form style={styles.form} onSubmit={handleLogin}>
                <div style={styles.inputGroup}>
                    <User size={20} style={styles.inputIcon} />
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        style={styles.input}
                        autoComplete="email"
                    />
                </div>

                <div style={styles.inputGroup}>
                    <Lock size={20} style={styles.inputIcon} />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña"
                        style={styles.input}
                        autoComplete="current-password"
                    />
                </div>

                {error && (
                    <div style={styles.errorBox}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    style={styles.loginBtn}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <><Loader size={20} className="spin" /> Ingresando...</>
                    ) : (
                        <><LogIn size={20} /> Iniciar Sesión</>
                    )}
                </button>

                <button
                    type="button"
                    style={styles.demoBtn}
                    onClick={handleDemoLogin}
                >
                    Modo Demo (Sin conexión)
                </button>
            </form>

            <p style={styles.footer}>
                ISES/AFINIA • v1.0.0
            </p>
        </div>
    );
}

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        backgroundColor: '#0f172a',
        color: '#fff'
    },
    logoSection: {
        textAlign: 'center',
        marginBottom: '40px'
    },
    logo: {
        fontSize: '60px',
        marginBottom: '16px'
    },
    appName: {
        fontSize: '32px',
        fontWeight: 800,
        margin: 0,
        background: 'linear-gradient(135deg, #3b82f6, #10b981)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
    },
    tagline: {
        fontSize: '14px',
        color: '#64748b',
        marginTop: '8px'
    },
    form: {
        width: '100%',
        maxWidth: '360px'
    },
    inputGroup: {
        position: 'relative',
        marginBottom: '16px'
    },
    inputIcon: {
        position: 'absolute',
        left: '16px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#64748b'
    },
    input: {
        width: '100%',
        padding: '16px 16px 16px 50px',
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        color: '#fff',
        fontSize: '16px',
        boxSizing: 'border-box'
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        backgroundColor: '#7f1d1d',
        borderRadius: '10px',
        marginBottom: '16px',
        fontSize: '14px',
        color: '#fecaca'
    },
    loginBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        width: '100%',
        padding: '16px',
        backgroundColor: '#3b82f6',
        border: 'none',
        borderRadius: '12px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        marginTop: '8px'
    },
    demoBtn: {
        width: '100%',
        padding: '14px',
        backgroundColor: 'transparent',
        border: '1px solid #475569',
        borderRadius: '12px',
        color: '#94a3b8',
        fontSize: '14px',
        cursor: 'pointer',
        marginTop: '12px'
    },
    footer: {
        marginTop: '40px',
        fontSize: '12px',
        color: '#475569'
    }
};
