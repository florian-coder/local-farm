const {
  computeProductRatings,
  normalizeLinear,
  normalizeLog,
  toOrderStatsByProduct,
} = require('../src/lib/productRating');

describe('product rating helper', () => {
  it('computes normalized linear and logarithmic components', () => {
    expect(normalizeLinear(5, 10)).toBeCloseTo(0.5, 6);
    expect(normalizeLinear(10, 0)).toBe(0);

    expect(normalizeLog(9, 9)).toBeCloseTo(1, 6);
    expect(normalizeLog(0, 9)).toBeCloseTo(0, 6);
    expect(normalizeLog(20, 0)).toBe(0);
  });

  it('rewards repeated orders more than a one-off bulk order', () => {
    const products = [
      { id: 'bulk', Price: 20 },
      { id: 'loyal', Price: 20 },
    ];

    const orderStatsByProduct = new Map([
      ['bulk', { quantity: 50, orderCount: 1 }],
      ['loyal', { quantity: 50, orderCount: 50 }],
    ]);

    const ratings = computeProductRatings({ products, orderStatsByProduct });
    const bulk = ratings.find((entry) => entry.productId === 'bulk');
    const loyal = ratings.find((entry) => entry.productId === 'loyal');

    expect(bulk).toBeDefined();
    expect(loyal).toBeDefined();
    expect(loyal.rating).toBeGreaterThan(bulk.rating);
    expect(loyal.rating).toBeCloseTo(5, 2);
  });

  it('applies the requested weighted formula and scales to 1-5', () => {
    const products = [
      { id: 'p1', Price: 10 },
      { id: 'p2', Price: 20 },
    ];

    const orderStatsByProduct = new Map([
      ['p1', { quantity: 9, orderCount: 9 }],
      ['p2', { quantity: 0, orderCount: 0 }],
    ]);

    const ratings = computeProductRatings({ products, orderStatsByProduct });
    const p1 = ratings.find((entry) => entry.productId === 'p1');
    const p2 = ratings.find((entry) => entry.productId === 'p2');

    // p1: 1 + 4 * (0.2 * 0.5 + 0.3 * 1 + 0.5 * 1) = 4.6
    expect(p1.rating).toBeCloseTo(4.6, 2);
    // p2: 1 + 4 * (0.2 * 1 + 0.3 * 0 + 0.5 * 0) = 1.8
    expect(p2.rating).toBeCloseTo(1.8, 2);
  });

  it('aggregates quantity and unique order count per product', () => {
    const map = toOrderStatsByProduct([
      { order_id: 'o1', product_id: 'p1', quantity: 1 },
      { order_id: 'o1', product_id: 'p1', quantity: 2 },
      { order_id: 'o2', product_id: 'p1', quantity: 3 },
      { order_id: 'o2', product_id: 'p2', quantity: 4 },
    ]);

    expect(map.get('p1')).toEqual({ quantity: 6, orderCount: 2 });
    expect(map.get('p2')).toEqual({ quantity: 4, orderCount: 1 });
  });
});
