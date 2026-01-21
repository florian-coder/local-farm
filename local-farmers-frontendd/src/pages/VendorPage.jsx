import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const initialProfile = {
  farmName: '',
  displayName: '',
  lat: '',
  lng: '',
  bio: '',
};

const initialProduct = {
  name: '',
  category: 'vegetable',
  unit: 'kg',
  available: true,
  rating: 4.0,
};

export default function VendorPage() {
  const { status: authStatus, user } = useAuth();
  const [profile, setProfile] = useState(initialProfile);
  const [profileStatus, setProfileStatus] = useState({
    state: 'idle',
    message: '',
  });
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState(initialProduct);
  const [productStatus, setProductStatus] = useState({
    state: 'idle',
    message: '',
  });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || user.role !== 'vendor') {
      return;
    }

    let active = true;

    const loadProfile = async () => {
      try {
        const response = await apiFetch('/api/vendor/profile', { method: 'GET' });
        const data = await response.json();
        if (!active) {
          return;
        }
        if (data.vendor) {
          setProfile({
            farmName: data.vendor.farmName || '',
            displayName: data.vendor.displayName || '',
            lat: data.vendor.lat ?? '',
            lng: data.vendor.lng ?? '',
            bio: data.vendor.bio || '',
          });
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setProfileStatus({
          state: 'error',
          message: 'Unable to load profile.',
        });
      }
    };

    const loadProducts = async () => {
      try {
        const response = await apiFetch('/api/vendor/products', { method: 'GET' });
        const data = await response.json();
        if (!active) {
          return;
        }
        setProducts(data.products || []);
      } catch (error) {
        if (!active) {
          return;
        }
        setProductStatus({
          state: 'error',
          message: 'Unable to load products.',
        });
      }
    };

    loadProfile();
    loadProducts();

    return () => {
      active = false;
    };
  }, [authStatus, user]);

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileStatus({ state: 'loading', message: 'Saving profile...' });

    try {
      const response = await apiFetch('/api/vendor/profile', {
        method: 'POST',
        body: JSON.stringify({
          ...profile,
          lat: profile.lat === '' ? null : Number(profile.lat),
          lng: profile.lng === '' ? null : Number(profile.lng),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save profile.');
      }
      setProfileStatus({ state: 'success', message: 'Profile saved.' });
      if (data.vendor) {
        setProfile({
          farmName: data.vendor.farmName || '',
          displayName: data.vendor.displayName || '',
          lat: data.vendor.lat ?? '',
          lng: data.vendor.lng ?? '',
          bio: data.vendor.bio || '',
        });
      }
    } catch (error) {
      setProfileStatus({
        state: 'error',
        message: error.message || 'Unable to save profile.',
      });
    }
  };

  const handleProductChange = (event) => {
    const { name, value, type, checked } = event.target;
    setProductForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    setProductStatus({ state: 'loading', message: 'Adding product...' });

    try {
      const response = await apiFetch('/api/vendor/products', {
        method: 'POST',
        body: JSON.stringify({
          ...productForm,
          rating: Number(productForm.rating),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to add product.');
      }
      setProducts((prev) => [...prev, data.product]);
      setProductForm(initialProduct);
      setProductStatus({ state: 'success', message: 'Product added.' });
    } catch (error) {
      setProductStatus({
        state: 'error',
        message: error.message || 'Unable to add product.',
      });
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!productId) {
      return;
    }
    const confirmed = window.confirm('Delete this product?');
    if (!confirmed) {
      return;
    }
    setProductStatus({ state: 'loading', message: 'Deleting product...' });

    try {
      const response = await apiFetch(`/api/vendor/products/${productId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete product.');
      }
      setProducts((prev) => prev.filter((product) => product.id !== productId));
      setProductStatus({ state: 'success', message: 'Product deleted.' });
    } catch (error) {
      setProductStatus({
        state: 'error',
        message: error.message || 'Unable to delete product.',
      });
    }
  };

  if (authStatus === 'loading') {
    return <div className="notice">Loading vendor dashboard...</div>;
  }

  if (!user || user.role !== 'vendor') {
    return (
      <div className="page-section">
        <h1>Vendor access required</h1>
        <p className="muted">
          Log in with a vendor account to manage your farm profile and products.
        </p>
        <Link className="button primary" to="/auth/login">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h1>Vendor dashboard</h1>
          <p className="muted">Welcome back, {user.username}.</p>
        </div>
        <Link className="button ghost" to="/markets">
          View markets
        </Link>
      </div>

      <div className="vendor-grid">
        <form className="form-card" onSubmit={handleProfileSubmit}>
          <h2>Farm profile</h2>
          <label className="field">
            Farm name
            <input
              type="text"
              name="farmName"
              value={profile.farmName}
              onChange={handleProfileChange}
              required
            />
          </label>
          <label className="field">
            Display name
            <input
              type="text"
              name="displayName"
              value={profile.displayName}
              onChange={handleProfileChange}
            />
          </label>
          <div className="field-row">
            <label className="field">
              Latitude
              <input
                type="number"
                step="0.0001"
                name="lat"
                value={profile.lat}
                onChange={handleProfileChange}
              />
            </label>
            <label className="field">
              Longitude
              <input
                type="number"
                step="0.0001"
                name="lng"
                value={profile.lng}
                onChange={handleProfileChange}
              />
            </label>
          </div>
          <label className="field">
            Bio
            <textarea
              name="bio"
              rows="3"
              value={profile.bio}
              onChange={handleProfileChange}
            />
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={profileStatus.state === 'loading'}
          >
            {profileStatus.state === 'loading' ? 'Saving...' : 'Save profile'}
          </button>
          {profileStatus.message && (
            <p
              className={`notice ${
                profileStatus.state === 'error' ? 'error' : 'success'
              }`}
            >
              {profileStatus.message}
            </p>
          )}
        </form>

        <div className="form-card">
          <h2>Products</h2>
          <form className="stack" onSubmit={handleProductSubmit}>
            <label className="field">
              Product name
              <input
                type="text"
                name="name"
                value={productForm.name}
                onChange={handleProductChange}
                required
              />
            </label>
            <label className="field">
              Category
              <input
                type="text"
                name="category"
                value={productForm.category}
                onChange={handleProductChange}
              />
            </label>
            <label className="field">
              Unit
              <input
                type="text"
                name="unit"
                value={productForm.unit}
                onChange={handleProductChange}
              />
            </label>
            <label className="field">
              Rating (1-5)
              <input
                type="number"
                name="rating"
                min="1"
                max="5"
                step="0.1"
                value={productForm.rating}
                onChange={handleProductChange}
                required
              />
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                name="available"
                checked={productForm.available}
                onChange={handleProductChange}
              />
              Available now
            </label>
            <button
              className="button secondary"
              type="submit"
              disabled={productStatus.state === 'loading'}
            >
              {productStatus.state === 'loading' ? 'Adding...' : 'Add product'}
            </button>
            {productStatus.message && (
              <p
                className={`notice ${
                  productStatus.state === 'error' ? 'error' : 'success'
                }`}
              >
                {productStatus.message}
              </p>
            )}
          </form>

          <div className="products-list">
            {products.length === 0 ? (
              <p className="muted">No products added yet.</p>
            ) : (
              products.map((product) => (
                <div className="product-row" key={product.id}>
                  <div className="product-info">
                    <div className="product-thumb">
                      {product.image?.url ? (
                        <img src={product.image.url} alt={product.image.alt || product.name} />
                      ) : (
                        <span>{product.name?.charAt(0)?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <div>
                      <strong>{product.name}</strong>
                      <p className="muted">
                        {product.category} · {product.unit} ·{' '}
                        {product.rating
                          ? `Rating ${product.rating}/5`
                          : 'Rating N/A'}
                      </p>
                      {product.image?.photographer && product.image?.photoUrl && (
                        <p className="muted photo-credit">
                          Photo by{' '}
                          <a
                            href={product.image.photographerUrl || product.image.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {product.image.photographer}
                          </a>{' '}
                          on{' '}
                          <a
                            href={product.image.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Pexels
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="product-actions">
                    <span className={product.available ? 'badge' : 'badge ghost'}>
                      {product.available ? 'Available' : 'Unavailable'}
                    </span>
                    <button
                      className="button ghost small"
                      type="button"
                      onClick={() => handleDeleteProduct(product.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="muted photo-credit">
            <a href="https://www.pexels.com" target="_blank" rel="noreferrer">
              Photos provided by Pexels
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
