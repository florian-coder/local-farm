import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth.jsx';
import CustomerProfilePage from './CustomerProfilePage.jsx';
import VendorPage from './VendorPage.jsx';

export default function ProfilePage() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <div className="notice">Loading profile...</div>;
  }

  if (!user) {
    return (
      <div className="page-section">
        <h1>Profile access required</h1>
        <p className="muted">Log in to access your profile.</p>
        <Link className="button primary" to="/auth/login">
          Log in
        </Link>
      </div>
    );
  }

  if (user.role === 'vendor') {
    return <VendorPage />;
  }

  return <CustomerProfilePage />;
}
