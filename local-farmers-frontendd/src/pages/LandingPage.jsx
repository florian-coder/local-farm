import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch, getApiBase } from '../lib/api.js';
import { getQualityLabel } from '../lib/quality.js';

const initialStatus = {
  state: 'idle',
  label: 'API status not checked',
  checkedAt: null,
};

const fallbackSignals = [
  { label: 'Open farm stands', value: '0' },
  { label: 'Active growers', value: '0' },
  { label: 'Pickup points', value: '0' },
];

export default function LandingPage() {
  const apiBase = useMemo(() => getApiBase(), []);
  const [status, setStatus] = useState(initialStatus);
  const [marketState, setMarketState] = useState({
    status: 'loading',
    markets: [],
  });
  const [heroPhoto, setHeroPhoto] = useState(null);

  const runHealthCheck = useCallback(async (signal) => {
    setStatus({
      state: 'loading',
      label: 'Checking API connectivity',
      checkedAt: null,
    });

    try {
      const response = await apiFetch('/api/health', { signal, method: 'GET' });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const label = data.status === 'ok' ? 'API online' : 'API degraded';

      setStatus({
        state: 'ok',
        label,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setStatus({
        state: 'error',
        label: 'API offline',
        checkedAt: new Date().toLocaleTimeString(),
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    runHealthCheck(controller.signal);
    return () => controller.abort();
  }, [runHealthCheck]);

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
        setMarketState({ status: 'success', markets: data.markets || [] });
      } catch (error) {
        if (!active) {
          return;
        }
        setMarketState({ status: 'error', markets: [] });
      }
    };

    loadMarkets();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPhoto = async () => {
      try {
        const query = encodeURIComponent('farmers market');
        const response = await apiFetch(`/api/external/pexels?q=${query}`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const photo = data?.photos?.[0];
        if (!active || !photo) {
          return;
        }
        setHeroPhoto(photo);
      } catch (error) {
        if (!active) {
          return;
        }
        setHeroPhoto(null);
      }
    };

    loadPhoto();

    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = () => {
    const controller = new AbortController();
    runHealthCheck(controller.signal);
  };

  const statusClass =
    status.state === 'ok'
      ? 'status status-ok'
      : status.state === 'error'
      ? 'status status-error'
      : 'status status-loading';

  const primaryMarket = marketState.markets[0];
  const totalSignals = marketState.markets.reduce(
    (acc, market) => ({
      openStands: acc.openStands + (market.openStands || 0),
      activeGrowers: acc.activeGrowers + (market.activeGrowers || 0),
      pickupPoints: acc.pickupPoints + (market.pickupPoints || 0),
    }),
    { openStands: 0, activeGrowers: 0, pickupPoints: 0 },
  );

  const communitySignals = marketState.markets.length
    ? [
        { label: 'Open farm stands', value: String(totalSignals.openStands) },
        { label: 'Active growers', value: String(totalSignals.activeGrowers) },
        { label: 'Pickup points', value: String(totalSignals.pickupPoints) },
      ]
    : fallbackSignals;

  const soilLabel = getQualityLabel(primaryMarket?.soil?.qualityScore);
  const soilScore = primaryMarket?.soil?.qualityScore ?? 'N/A';
  const marketNews = primaryMarket?.marketNews || [];

  return (
    <>
      <header className="hero">
        <div className="hero-content">
          <p className="eyebrow">Seasonal, traceable, neighbor-grown</p>
          <h1>Local Farmers Collective</h1>
          <p className="lead">
            A curated network for fresh produce, transparent supply, and direct
            connections between growers and customers.
          </p>
          <div className="cta-row">
            <Link className="button primary" to="/markets">
              Browse markets
            </Link>
            <Link className="button ghost" to="/auth/signup?role=vendor">
              Become a vendor
            </Link>
          </div>
        </div>
        <div className="hero-card">
          <div className={statusClass} aria-live="polite">
            {status.label}
          </div>
          <p className="muted">API base: {apiBase}</p>
          <p className="muted">
            {status.checkedAt
              ? `Last checked at ${status.checkedAt}`
              : 'Running first health check'}
          </p>
          <button
            className="button secondary"
            type="button"
            onClick={handleRefresh}
            disabled={status.state === 'loading'}
          >
            {status.state === 'loading' ? 'Checking...' : 'Refresh status'}
          </button>
          <div
            className="hero-photo"
            style={
              heroPhoto?.src?.large
                ? { backgroundImage: `url(${heroPhoto.src.large})` }
                : undefined
            }
          >
            {!heroPhoto && <span className="photo-fallback">Market view</span>}
          </div>
          {heroPhoto?.photographer && heroPhoto?.url && (
            <p className="muted photo-credit">
              Photo by{' '}
              <a
                href={heroPhoto.photographer_url || heroPhoto.url}
                target="_blank"
                rel="noreferrer"
              >
                {heroPhoto.photographer}
              </a>{' '}
              on{' '}
              <a href={heroPhoto.url} target="_blank" rel="noreferrer">
                Pexels
              </a>
            </p>
          )}
        </div>
      </header>

      <section className="grid" id="markets">
        {communitySignals.map((signal) => (
          <article className="card" key={signal.label}>
            <p className="card-value">{signal.value}</p>
            <p className="card-label">{signal.label}</p>
          </article>
        ))}
      </section>

      <section className="split">
        <div>
          <h2>Today&apos;s market pulse</h2>
          <p className="muted">
            Real-time pricing and soil health estimates for the leading market.
          </p>
          <div className="signal-card">
            <p className="label">Soil quality estimate</p>
            <p className="value">
              {soilLabel} ({soilScore})
            </p>
            <p className="muted">
              pH {primaryMarket?.soil?.ph ?? '--'} · Organic carbon{' '}
              {primaryMarket?.soil?.organicCarbon ?? '--'}
            </p>
          </div>
        </div>
        <div className="stack">
          {marketNews.length === 0 && (
            <article className="list-card">
              <h3>No market updates yet</h3>
              <p className="muted">Pricing insights will appear once available.</p>
            </article>
          )}
          {marketNews.slice(0, 3).map((news, index) => (
            <article
              className="list-card"
              key={news.commodity}
              style={{ '--delay': `${index * 120}ms` }}
            >
              <h3>{news.commodity}</h3>
              <p className="muted">{news.headline}</p>
              <p className="muted">
                ${news.priceRange?.min ?? '--'} - ${news.priceRange?.max ?? '--'}{' '}
                {news.priceRange?.unit || ''}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel" id="partners">
        <div>
          <h2>Built for grower success</h2>
          <p>
            Manage pickups, send updates to loyal customers, and keep product
            availability synchronized across channels.
          </p>
        </div>
        <div className="panel-grid">
          <div>
            <p className="panel-label">Response time</p>
            <p className="panel-value">&lt; 2 hours</p>
          </div>
          <div>
            <p className="panel-label">Order accuracy</p>
            <p className="panel-value">98%</p>
          </div>
          <div>
            <p className="panel-label">Pickup windows</p>
            <p className="panel-value">3 per day</p>
          </div>
        </div>
      </section>
    </>
  );
}
