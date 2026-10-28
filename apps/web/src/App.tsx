import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from './components/Layout.js';

import { Home } from './pages/Home.js';
import { HQPage } from './pages/HQPage.js';
import { CommandPage } from './pages/CommandPage.js';
import { WorkerWorkstation } from './pages/WorkerWorkstation.js';
import { TeachingWorkspace } from './pages/TeachingWorkspace.js';
import { Settings } from './pages/Settings.js';
import { Login } from './pages/Login.js';
import { Register } from './pages/Register.js';

import { BootstrapWrapper } from './components/BootstrapWrapper.js';
import { AuthProvider, useAuth } from './components/AuthContext.js';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: '#07080c' }}>
        <div className="analysis-spinner" style={{ width: 40, height: 40, borderWidth: 2 }} />
      </div>
    );
  }
  
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  
  return <BootstrapWrapper>{children}</BootstrapWrapper>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public marketing & registration */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Dedicated Fullscreen Teaching Sandbox */}
          <Route path="/workers/:id/teach" element={
            <ProtectedRoute>
              <TeachingWorkspace />
            </ProtectedRoute>
          } />

          {/* Autoworker Enterprise Digital Operations Shell */}
          <Route path="*" element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  {/* HQ — Spatial Workplace (Primary Portal Entry) */}
                  <Route path="/workforce" element={<HQPage />} />
                  <Route path="/hq" element={<HQPage />} />

                  {/* Command — Operational & Analytical Control Mode */}
                  <Route path="/command" element={<CommandPage />} />

                  {/* Dedicated Worker Workstation */}
                  <Route path="/workers/:id" element={<WorkerWorkstation />} />

                  {/* Settings */}
                  <Route path="/settings" element={<Settings />} />

                  {/* Fallback to HQ */}
                  <Route path="*" element={<Navigate to="/workforce" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
