import { render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import App from '../App.jsx';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input) => {
        const url = typeof input === 'string' ? input : input.url;

        if (url.includes('/api/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'ok' }),
          });
        }

        if (url.includes('/api/auth/me')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: 'Unauthorized' }),
          });
        }

        if (url.includes('/api/markets')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                markets: [
                  {
                    id: 'm1',
                    name: 'Central Market',
                    openStands: 12,
                    activeGrowers: 48,
                    pickupPoints: 7,
                    soil: { qualityScore: 72, ph: 6.4, organicCarbon: 12 },
                    marketNews: [
                      {
                        commodity: 'tomatoes',
                        headline: 'Seasonal supply tightening',
                        priceRange: { min: 1.2, max: 2.4, unit: 'USD/lb' },
                      },
                    ],
                    globalStats: { item: 'Tomatoes', series: [{ year: 2021, value: 118 }] },
                    products: [],
                  },
                ],
              }),
          });
        }

        if (url.includes('/api/external/pexels')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                photos: [
                  {
                    id: 1,
                    alt: 'Farmers market',
                    photographer: 'Test',
                    src: { large: 'https://example.com/photo.jpg' },
                  },
                ],
              }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the hero headline', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /local farmers collective/i })
    ).toBeInTheDocument();
  });

  it('shows API status after health check', async () => {
    render(<App />);

    expect(await screen.findByText(/api online/i)).toBeInTheDocument();
  });
});
