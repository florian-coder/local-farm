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
import ProfilePage from './pages/ProfilePage.jsx';
import VendorPublicProfilePage from './pages/VendorPublicProfilePage.jsx';
import VendorProductsPage from './pages/VendorProductsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { AuthProvider, useAuth } from './lib/auth.jsx';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, logout } = useAuth();
  const isAuthRoute = location.pathname.startsWith('/auth/');
  const showLogin = status !== 'authenticated' && !isAuthRoute;
  const initial = user?.username?.charAt(0)?.toUpperCase() || '?';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

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
