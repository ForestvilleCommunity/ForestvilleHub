import { Toaster } from "@/components/ui/toaster"
import ThemeProvider from './lib/ThemeProvider';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Account from './pages/Account';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import DrillLibrary from './pages/DrillLibrary';
import DrillBuilder from './pages/DrillBuilder';
import Sessions from './pages/Sessions';
import SessionBuilder from './pages/SessionBuilder';
import LiveSession from './pages/LiveSession';
import Schedule from './pages/Schedule';
import Games from './pages/Games';
import Stats from './pages/Stats';
import GameBuilder from './pages/GameBuilder';
import LiveGame from './pages/LiveGame';
import PlayerDetail from './pages/PlayerDetail';
import DrillDetail from './pages/DrillDetail';
import AdminUsers from './pages/AdminUsers';
import AdminDashboard from './pages/AdminDashboard';
import TeamManage from './pages/TeamManage';
import SquadManage from './pages/SquadManage';
import ClubChallenges from './pages/ClubChallenges';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/players" element={<Players />} />
          <Route path="/drills" element={<DrillLibrary />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/games" element={<Games />} />
          <Route path="/stats" element={<Stats />} />
        </Route>
        <Route path="/drills/new" element={<DrillBuilder />} />
        <Route path="/drills/:drillId/edit" element={<DrillBuilder />} />
        <Route path="/sessions/new" element={<SessionBuilder />} />
        <Route path="/sessions/:sessionId/edit" element={<SessionBuilder />} />
        <Route path="/sessions/:sessionId/live" element={<LiveSession />} />
        <Route path="/games/new" element={<GameBuilder />} />
        <Route path="/games/:gameId/edit" element={<GameBuilder />} />
        <Route path="/games/:gameId/live" element={<LiveGame />} />
        <Route path="/players/:playerId" element={<PlayerDetail />} />
        <Route path="/drills/:drillId/view" element={<DrillDetail />} />
        <Route path="/challenges" element={<ClubChallenges />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/team/:teamId" element={<TeamManage />} />
        <Route path="/admin/squad/:squadId" element={<SquadManage />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </ErrorBoundary>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;