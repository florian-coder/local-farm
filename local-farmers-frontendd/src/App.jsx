import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  Navigate,
} from 'react-router-dom';

import LandingPage from './pages/LandingPage.jsx';
import FarmersPage from './pages/FarmersPage.jsx';
import MarketsPage from './pages/MarketsPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import VendorPublicProfilePage from './pages/VendorPublicProfilePage.jsx';
import VendorProductsPage from './pages/VendorProductsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { apiFetch } from './lib/api.js';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { supabase } from './lib/supabase.js';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, logout } = useAuth();
  const isAuthRoute = location.pathname.startsWith('/auth/');
  const showLogin = status !== 'authenticated' && !isAuthRoute;
  const initial = user?.username?.charAt(0)?.toUpperCase() || '?';
  const isChatEnabled =
    status === 'authenticated' &&
    (user?.role === 'customer' || user?.role === 'vendor');
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  useEffect(() => {
    if (!isChatEnabled) {
      setChatUnreadCount(0);
      return undefined;
    }

    let active = true;
    let channel = null;
    const loadUnread = async () => {
      try {
        const response = await apiFetch('/api/chat/conversations', { method: 'GET' });
        const data = await response.json();
        if (!active || !response.ok) {
          return null;
        }
        const totalUnread = Number(data.totalUnread);
        if (Number.isFinite(totalUnread) && totalUnread > 0) {
          setChatUnreadCount(Math.floor(totalUnread));
          return data;
        }
        const fallbackUnread = Array.isArray(data.conversations)
          ? data.conversations.reduce((sum, entry) => {
              const count = Number(entry.unreadCount);
              return Number.isFinite(count) ? sum + count : sum;
            }, 0)
          : 0;
        setChatUnreadCount(fallbackUnread > 0 ? Math.floor(fallbackUnread) : 0);
        return data;
      } catch (error) {
        if (active) {
          setChatUnreadCount(0);
        }
        return null;
      }
    };

    const subscribeToUnread = async () => {
      const data = await loadUnread();
      if (!active) {
        return;
      }

      const vendorIdFromApi =
        typeof data?.vendorId === 'string' && data.vendorId.trim()
          ? data.vendorId.trim()
          : '';
      const participantId =
        user?.role === 'vendor' && vendorIdFromApi ? vendorIdFromApi : user?.id;
      if (!participantId) {
        return;
      }

      const filter =
        user?.role === 'customer'
          ? `customer_id=eq.${participantId}`
          : `vendor_id=eq.${participantId}`;

      channel = supabase
        .channel(`nav-chat-unread-${user?.id}-${participantId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter,
          },
          () => {
            loadUnread().catch(() => {});
          },
        )
        .subscribe();
    };

    subscribeToUnread().catch(() => {});

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isChatEnabled, user?.id, user?.role]);

  return (
    <nav className="nav">
      <Link className="brand" to="/">
        Local Farmers Collective
      </Link>
      <div className="nav-links">
        <Link to="/markets/fruits_and_vegetables">Fruits & Vegetables</Link>
        <Link to="/markets/meat">Meat</Link>
        <Link to="/markets/dairy_products">Dairy</Link>
        <Link to="/farmers">Farmers</Link>
        {status === 'authenticated' && (
          <Link className="nav-chat-link" to="/chat">
            Chat
            {chatUnreadCount > 0 && (
              <span className="chat-nav-badge">{chatUnreadCount}</span>
            )}
          </Link>
        )}
        <Link to="/profile">Profile</Link>
        {status === 'authenticated' && user?.role === 'vendor' && (
          <Link to="/vendor/products_uploaded">My Products</Link>
        )}
        {showLogin && (
          <Link className="button ghost" to="/auth/login">
            Log in
          </Link>
        )}
        {status === 'authenticated' && (
          <>
            <span className="avatar" title={user.username}>
              {initial}
            </span>
            <button className="button ghost" type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

function AppShell() {
  return (
    <div className="page">
      <Navigation />
      <main className="main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/markets"
            element={<Navigate to="/markets/fruits_and_vegetables" />}
          />
          <Route path="/farmers" element={<FarmersPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/markets/:category" element={<MarketsPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/farms/:vendorId" element={<VendorPublicProfilePage />} />
          <Route path="/vendor" element={<Navigate to="/profile" replace />} />
          <Route path="/vendor/products_uploaded" element={<VendorProductsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="footer">
        <p>Local Farmers Collective - Built for community-powered food systems.</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
