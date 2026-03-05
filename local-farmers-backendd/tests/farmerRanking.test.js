const { buildMonthlyWinners, normalizeCategory } = require('../src/lib/farmerRanking');

describe('farmer ranking helper', () => {
  it('normalizes category aliases to canonical keys', () => {
    expect(normalizeCategory('Fruit & Veg')).toBe('fruits_and_vegetables');
    expect(normalizeCategory('dairy')).toBe('dairy_products');
    expect(normalizeCategory('meat')).toBe('meat');
  });

  it('selects winner using weighted normalized coefficient', () => {
    const result = buildMonthlyWinners([
      {
        category: 'meat',
        farmerId: 'farmer-a',
        farmerName: 'Farmer A',
        farmName: 'Alpha Farm',
        revenue: 1000,
        orderCount: 20,
        quantity: 200,
      },
      {
        category: 'meat',
        farmerId: 'farmer-b',
        farmerName: 'Farmer B',
        farmName: 'Beta Farm',
        revenue: 800,
        orderCount: 25,
        quantity: 210,
      },
    ]);

    const meat = result.categories.find((entry) => entry.category === 'meat');
    expect(meat).toBeDefined();
    expect(meat.winner.farmerId).toBe('farmer-a');
    expect(meat.winner.coefficient).toBeCloseTo(93.05, 2);
    expect(meat.winner.scores.money).toBe(100);
    expect(meat.winner.scores.orders).toBe(80);
    expect(meat.winner.scores.quantity).toBeCloseTo(95.24, 2);
  });

  it('returns null winners when no eligible sales exist in a category', () => {
    const result = buildMonthlyWinners([]);
    const dairy = result.categories.find(
      (entry) => entry.category === 'dairy_products',
    );

    expect(dairy).toBeDefined();
    expect(dairy.winner).toBeNull();
    expect(dairy.maxima).toEqual({ revenue: 0, orders: 0, quantity: 0 });
  });
});
