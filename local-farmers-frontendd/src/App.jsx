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
import AdminPage from './pages/AdminPage.jsx';
import { apiFetch } from './lib/api.js';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { supabase } from './lib/supabase.js';

function FruitsVegIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 8c-3 0-5 2.4-5 5.3S9.1 19 12 19s5-2.4 5-5.7S15 8 12 8Z" />
      <path d="M12 8c0-1.7.8-3.1 2.3-3.8" />
      <path d="M11.2 6.4c-1.5-.8-3.2-.7-4.2.4" />
      <path
        d="M14.7 4.3c1.3-.1 2.5.6 3 1.8-1.4.4-2.5-.2-3-1.8Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function MeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 8.8c2.2-1.8 5.8-2.6 8.7-1.1 2 1 3.3 2.9 3.3 5 0 2.9-2.3 5.3-5.2 5.3-1.4 0-2.7-.5-3.8-1.4-.9-.7-1.7-1-2.8-1-1.7 0-3.2-1.4-3.2-3.2 0-1.4.6-2.5 1.6-3.6Z" />
      <circle cx="11.7" cy="12.2" r="1.5" />
      <path d="M4.4 15.2 3 16.6m2.9-2.9-1.4 1.4" />
    </svg>
  );
}

function DairyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.5 5h4v2l-.8 1.4v8.8c0 .9-.7 1.6-1.6 1.6H6.9c-.9 0-1.6-.7-1.6-1.6V8.4L6.5 7V5Z" />
      <path d="M13.2 13.8h7.2l-2.2 4.1h-7.1Z" />
      <circle cx="16.1" cy="15.4" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="16.7" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MARKET_MENU_ITEMS = [
  {
    to: '/markets/fruits_and_vegetables',
    label: 'Fruits & Vegetables',
    Icon: FruitsVegIcon,
  },
  {
    to: '/markets/meat',
    label: 'Meat',
    Icon: MeatIcon,
  },
  {
    to: '/markets/dairy_products',
    label: 'Dairy',
    Icon: DairyIcon,
  },
];

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, logout } = useAuth();
  const isAuthRoute = location.pathname.startsWith('/auth/');
  const showLogin = status !== 'authenticated' && !isAuthRoute;
  const isMarketsRoute = location.pathname.startsWith('/markets');
  const initial = user?.username?.charAt(0)?.toUpperCase() || '?';
  const isChatEnabled =
    status === 'authenticated' &&
    (user?.role === 'customer' || user?.role === 'vendor');
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [isMarketsMenuOpen, setIsMarketsMenuOpen] = useState(false);

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

  useEffect(() => {
    setIsMarketsMenuOpen(false);
  }, [location.pathname]);

  return (
    <nav className="nav">
      <Link className="brand" to="/">
        Local Farmers Collective
      </Link>
      <div className="nav-links">
        <div className="nav-market-menu">
          <button
            className={`nav-market-toggle ${isMarketsRoute ? 'active' : ''}`}
            type="button"
            onClick={() => setIsMarketsMenuOpen((prev) => !prev)}
          >
            Markets
          </button>
          {isMarketsMenuOpen && (
            <div className="nav-market-dropdown">
              {MARKET_MENU_ITEMS.map(({ to, label, Icon }) => (
                <Link className="nav-market-pill" key={to} to={to}>
                  <span className="nav-market-pill-icon">
                    <Icon />
                  </span>
                  <span className="nav-market-pill-label">{label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
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
          <Route path="/manage-portal/*" element={<AdminPage />} />
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
