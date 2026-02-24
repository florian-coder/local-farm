import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch, getApiBase } from '../lib/api.js';
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
  category: 'fruits_and_vegetables',
  type: '',
  unit: 'kg',
  price: 0,
  available: true,
  rating: 4.0,
  isBio: false,
  photo: null,
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
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);

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

  useEffect(() => {
    if (!productForm.photo) {
      setPhotoPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(productForm.photo);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [productForm.photo]);

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
    const { name, value, type, checked, files } = event.target;
    setProductForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'file' ? files[0] : value,
    }));
  };

  const handleClearPhoto = () => {
    setProductForm((prev) => ({ ...prev, photo: null }));
    setPhotoInputKey((prev) => prev + 1);
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    setProductStatus({ state: 'loading', message: 'Adding product...' });

    try {
      let imageUrl = null;
      if (productForm.photo) {
        const formData = new FormData();
        formData.append('photo', productForm.photo);
        const baseUrl = getApiBase();
        const uploadUrl = `${baseUrl}/api/vendor/upload-image`;
        console.log('Uploading to:', uploadUrl);
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        const contentType = uploadResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const uploadData = await uploadResponse.json();
          if (!uploadResponse.ok) {
            throw new Error(uploadData.error || 'Failed to upload image.');
          }
          imageUrl = uploadData.imageUrl;
        } else {
          const errorText = await uploadResponse.text();
          console.error('Non-JSON response from server:', errorText);
          throw new Error(`Server returned non-JSON response (${uploadResponse.status}). Check console for details.`);
        }
      }

      const payload = {
        ...productForm,
        rating: Number(productForm.rating),
        imageUrl,
      };
      delete payload.photo;
      const response = await apiFetch('/api/vendor/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to add product.');
      }
      setProducts((prev) => [...prev, data.product]);
      setProductForm(initialProduct);
      setPhotoInputKey((prev) => prev + 1);
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
              <select
                name="category"
                value={productForm.category}
                onChange={handleProductChange}
              >
                <option value="fruits_and_vegetables">Fruits and Vegetables</option>
                <option value="meat">Meat</option>
                <option value="dairy_products">Dairy Products</option>
              </select>
            </label>
            <label className="field">
              Variety / Type
              <input
                type="text"
                name="type"
                placeholder="e.g. Beef Brisket, Goat Milk, Cherry Tomato"
                value={productForm.type}
                onChange={handleProductChange}
              />
              <p className="muted" style={{ fontSize: '0.8em', marginTop: '0.2rem' }}>
                Specify details: e.g., which meat cut, type of milk, or specific vegetable variety.
              </p>
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
              Price
              <input
                type="number"
                name="price"
                step="0.01"
                min="0"
                value={productForm.price}
                onChange={handleProductChange}
                required
              />
            </label>
            <div className="upload-card">
              <div className="upload-preview">
                {photoPreview ? (
                  <img src={photoPreview} alt="Selected product" />
                ) : (
                  <div className="upload-placeholder">No photo selected</div>
                )}
              </div>
              <div className="upload-controls">
                <label className="field">
                  Product photo
                  <input
                    key={photoInputKey}
                    type="file"
                    name="photo"
                    accept="image/*"
                    onChange={handleProductChange}
                  />
                </label>
                <p className="muted upload-hint">
                  Optional. Max 5MB · JPG, PNG, or WebP. Defaults to a stock photo if left empty.
                </p>
                {productForm.photo && (
                  <div className="upload-meta">
                    <span>{productForm.photo.name}</span>
                    <span>
                      {(productForm.photo.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                )}
                {productForm.photo && (
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={handleClearPhoto}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
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
                name="isBio"
                checked={productForm.isBio}
                onChange={handleProductChange}
              />
              Bio Verified
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
            <div className="form-actions">
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
              <Link className="button ghost" to="/vendor/products_uploaded">
                View all my products
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
