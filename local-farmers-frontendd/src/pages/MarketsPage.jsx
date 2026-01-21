import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch } from '../lib/api.js';
import { getQualityLabel } from '../lib/quality.js';

const initialState = {
  status: 'loading',
  markets: [],
  error: null,
};

export default function MarketsPage() {
  const [state, setState] = useState(initialState);
  const [productImages, setProductImages] = useState({});
  const requestedImagesRef = useRef(new Set());

  useEffect(() => {
    let active = true;

    const loadMarkets = async () => {
      try {
        const response = await apiFetch('/api/markets', { method: 'GET' });
        if (!response.ok) {
          throw new Error('Failed to load markets.');
        }
        const data = await response.json();
        if (!active) {
          return;
        }
        setState({ status: 'success', markets: data.markets || [], error: null });
      } catch (error) {
        if (!active) {
          return;
        }
        setState({
          status: 'error',
          markets: [],
          error: error.message || 'Unable to load markets.',
        });
      }
    };

    loadMarkets();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'success') {
      return;
    }

    let active = true;
    const missing = [];

    state.markets.forEach((market) => {
      (market.products || []).forEach((product) => {
        if (!product?.id) {
          return;
        }
        if (product.image?.url || requestedImagesRef.current.has(product.id)) {
          return;
        }
        requestedImagesRef.current.add(product.id);
        missing.push(product);
      });
    });

    if (missing.length === 0) {
      return;
    }

    const loadImages = async () => {
      const results = await Promise.all(
        missing.map(async (product) => {
          try {
            const name = encodeURIComponent(product.name || 'fresh vegetables');
            const response = await apiFetch(
              `/api/external/product-image?name=${name}`,
            );
            if (!response.ok) {
              return null;
            }
            const data = await response.json();
            const image = data?.image || null;
            if (!image?.url) {
              return null;
            }
            return {
              id: product.id,
              image,
            };
          } catch (error) {
            return null;
          }
        }),
      );

      if (!active) {
        return;
      }

      setProductImages((prev) => {
        const next = { ...prev };
        results.forEach((entry) => {
          if (entry?.id && entry.image?.url) {
            next[entry.id] = entry.image;
          }
        });
        return next;
      });
    };

    loadImages();

    return () => {
      active = false;
    };
  }, [state.status, state.markets]);

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h1>Browse markets</h1>
          <p className="muted">
            Aggregated market signals, soil health estimates, and live pricing
            snapshots.
          </p>
        </div>
        <Link className="button ghost" to="/auth/signup?role=vendor">
          Become a vendor
        </Link>
      </div>

      {state.status === 'loading' && (
        <div className="notice">Loading markets...</div>
      )}
      {state.status === 'error' && (
        <div className="notice error">{state.error}</div>
      )}

      <div className="cards-grid">
        {state.markets.map((market) => (
          <article className="market-card" key={market.id}>
            <div className="market-card-header">
              <h2>{market.name}</h2>
              <span className="badge">{market.openStands} stands open</span>
            </div>
            <div className="market-meta">
              <div>
                <p className="label">Active growers</p>
                <p className="value">{market.activeGrowers}</p>
              </div>
              <div>
                <p className="label">Pickup points</p>
                <p className="value">{market.pickupPoints}</p>
              </div>
              <div>
                <p className="label">Soil quality</p>
                <p className="value">{getQualityLabel(market.soil?.qualityScore)}</p>
                <p className="muted">
                  Score {market.soil?.qualityScore ?? 'N/A'}
                </p>
              </div>
            </div>
            <div className="market-soil">
              <p className="label">Soil snapshot</p>
              <p className="muted">
                pH {market.soil?.ph ?? '--'} · Organic carbon{' '}
                {market.soil?.organicCarbon ?? '--'}
              </p>
            </div>
            <div className="market-news">
              <p className="label">Top market news</p>
              {market.marketNews && market.marketNews.length > 0 ? (
                <ul>
                  {market.marketNews.slice(0, 3).map((news) => (
                    <li key={news.commodity}>
                      <div className="market-news-item">
                        <div className="market-news-thumb">
                          {news.image?.url ? (
                            <img
                              src={news.image.url}
                              alt={news.image.alt || news.commodity}
                            />
                          ) : (
                            <span>
                              {news.commodity?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          )}
                        </div>
                        <div className="market-news-body">
                          <strong>{news.commodity}</strong>
                          <p className="muted">{news.headline}</p>
                          {Number.isFinite(news.priceRange?.min) &&
                            Number.isFinite(news.priceRange?.max) && (
                              <p className="muted">
                                ${news.priceRange.min} - ${news.priceRange.max}{' '}
                                {news.priceRange.unit}
                              </p>
                            )}
                          {news.image?.photographer && news.image?.photoUrl && (
                            <p className="muted photo-credit">
                              Photo by{' '}
                              <a
                                href={news.image.photographerUrl || news.image.photoUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {news.image.photographer}
                              </a>{' '}
                              on{' '}
                              <a
                                href={news.image.photoUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Pexels
                              </a>
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No market updates yet.</p>
              )}
            </div>
            <div className="market-products">
              <p className="label">Products from vendors</p>
              {market.products && market.products.length > 0 ? (
                <ul>
                  {market.products.slice(0, 4).map((product) => {
                    const resolvedImage = product.image?.url
                      ? product.image
                      : productImages[product.id];
                    return (
                      <li key={product.id}>
                        <div className="product-item">
                          <div className="product-thumb">
                            {resolvedImage?.url ? (
                              <img
                                src={resolvedImage.url}
                                alt={resolvedImage.alt || product.name}
                              />
                            ) : (
                              <span>
                                {product.name?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            )}
                          </div>
                          <div>
                            <strong>{product.name}</strong> · {product.unit}{' '}
                            <span className="muted">
                              ({product.vendor?.farmName || 'Vendor'})
                            </span>
                            <div className="muted">
                              {product.rating
                                ? `Rating ${product.rating}/5`
                                : 'Rating N/A'}
                            </div>
                            {resolvedImage?.photographer &&
                              resolvedImage?.photoUrl && (
                                <div className="muted photo-credit">
                                  Photo by{' '}
                                  <a
                                    href={
                                      resolvedImage.photographerUrl ||
                                      resolvedImage.photoUrl
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {resolvedImage.photographer}
                                  </a>{' '}
                                  on{' '}
                                  <a
                                    href={resolvedImage.photoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Pexels
                                  </a>
                                </div>
                              )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted">No vendor products yet.</p>
              )}
              <p className="muted photo-credit">
                <a href="https://www.pexels.com" target="_blank" rel="noreferrer">
                  Photos provided by Pexels
                </a>
              </p>
            </div>
            <div className="market-global">
              <p className="label">Global context</p>
              <p className="muted">
                {market.globalStats?.item} ·{' '}
                {market.globalStats?.series?.length || 0} data points
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
