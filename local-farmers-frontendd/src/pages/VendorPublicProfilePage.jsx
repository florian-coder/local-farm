import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  apiFetch,
  isUploadImage,
  resolveImageUrl,
  resolveUploadUrl,
} from '../lib/api.js';

const initialState = {
  status: 'loading',
  vendor: null,
  products: [],
  error: '',
};

const toLabel = (category) => {
  if (category === 'fruits_and_vegetables') {
    return 'Fruits and Vegetables';
  }
  if (category === 'meat') {
    return 'Meat';
  }
  if (category === 'dairy_products') {
    return 'Dairy Products';
  }
  return category || 'Other';
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided';
  }
  return String(value);
};

export default function VendorPublicProfilePage() {
  const { vendorId } = useParams();
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!vendorId) {
      setState({
        status: 'error',
        vendor: null,
        products: [],
        error: 'Vendor id is missing.',
      });
      return;
    }

    let active = true;
    const loadVendor = async () => {
      setState((prev) => ({ ...prev, status: 'loading', error: '' }));
      try {
        const response = await apiFetch(`/api/vendors/${vendorId}`, { method: 'GET' });
        const data = await response.json();
        if (!active) {
          return;
        }
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load farm profile.');
        }

        setState({
          status: 'success',
          vendor: data.vendor || null,
          products: data.products || [],
          error: '',
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          status: 'error',
          vendor: null,
          products: [],
          error: error.message || 'Unable to load farm profile.',
        });
      }
    };

    loadVendor();

    return () => {
      active = false;
    };
  }, [vendorId]);

  if (state.status === 'loading') {
    return <div className="notice">Loading farm profile...</div>;
  }

  if (state.status === 'error') {
    return (
      <div className="page-section">
        <div className="notice error">{state.error}</div>
        <Link className="button ghost" to="/markets/fruits_and_vegetables">
          Back to markets
        </Link>
      </div>
    );
  }

  const vendor = state.vendor;
  const profileRows = [
    { label: 'Farm name', value: vendor?.farmName },
    { label: 'Display name', value: vendor?.displayName },
    { label: 'Street address', value: vendor?.streetAddress },
    { label: 'Street number', value: vendor?.streetNumber },
    { label: 'County', value: vendor?.county },
    { label: 'City', value: vendor?.city },
    { label: 'Phone number', value: vendor?.phoneNumber },
    { label: 'Email', value: vendor?.email },
    {
      label: 'Delivery radius (km)',
      value:
        vendor?.deliveryRadiusKm === null || vendor?.deliveryRadiusKm === undefined
          ? ''
          : vendor.deliveryRadiusKm,
    },
    { label: 'Bio', value: vendor?.bio },
  ];

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h1>{vendor?.farmName || 'Farm profile'}</h1>
          <p className="muted">Public farm page</p>
        </div>
        <div className="button-group">
          {vendor?.id && (
            <Link className="button primary" to={`/chat?vendorId=${vendor.id}`}>
              Contact farmer
            </Link>
          )}
          <Link className="button ghost" to="/markets/fruits_and_vegetables">
            View markets
          </Link>
          <Link className="button ghost" to="/profile">
            My profile
          </Link>
        </div>
      </div>

      <article className="form-card farm-public-card">
        <div className="farm-linear-list">
          {profileRows.map((row) => (
            <div className="farm-linear-row" key={row.label}>
              <p className="farm-linear-label">{row.label}</p>
              <p className="farm-linear-value">{formatValue(row.value)}</p>
            </div>
          ))}
        </div>

        <section className="farm-block">
          <h2>Farm gallery (up to 10 images)</h2>
          {vendor?.farmImages?.length > 0 ? (
            <div className="farm-public-gallery">
              {vendor.farmImages.map((imageUrl, index) => (
                <img
                  key={`${imageUrl}-${index}`}
                  src={resolveImageUrl(imageUrl)}
                  alt={`${vendor.farmName || 'Farm'} image ${index + 1}`}
                />
              ))}
            </div>
          ) : (
            <p className="muted">No farm images uploaded.</p>
          )}
        </section>

        <section className="farm-block">
          <h2>Products listed</h2>
          {state.products.length > 0 ? (
            <div className="farm-products-list">
              {state.products.map((product) => {
                const hasUploadImage = isUploadImage(product.image);
                const imageUrl = product.image?.url
                  ? hasUploadImage
                    ? resolveUploadUrl(product.image.url)
                    : resolveImageUrl(product.image.url)
                  : null;

                return (
                  <div className="farm-product-row" key={product.id}>
                    <div className="farm-product-image">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.image?.alt || product.name}
                        />
                      ) : (
                        <span>{product.name?.charAt(0)?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <div className="farm-product-content">
                      <p className="farm-product-title">
                        {product.name}
                        {product.type ? ` (${product.type})` : ''}
                      </p>
                      <p className="muted">
                        {toLabel(product.category)} · {product.unit || 'unit'} ·{' '}
                        {product.price !== null && product.price !== undefined
                          ? `$${product.price}`
                          : 'Price N/A'}
                      </p>
                      <p className="muted">
                        {product.rating ? `Rating ${product.rating}/5` : 'Rating N/A'} ·{' '}
                        {product.isBio ? 'Bio verified' : 'Conventional'} ·{' '}
                        {product.available ? 'Available' : 'Unavailable'}
                      </p>
                      {vendor?.id && (
                        <Link className="button ghost small" to={`/chat?vendorId=${vendor.id}`}>
                          Contact farmer
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No products listed yet.</p>
          )}
        </section>
      </article>
    </div>
  );
}
