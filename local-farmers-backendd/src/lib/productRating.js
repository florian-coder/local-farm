const RATING_WEIGHTS = {
  price: 0.2,
  quantity: 0.3,
  orders: 0.5,
};

const RATING_ORDER_STATES = [
  'received_by_farmer',
  'preparing_order',
  'in_transit',
  'arrived',
  'received',
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeIdentifier = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const roundToTwo = (value) => Number(toNumber(value, 0).toFixed(2));

const normalizeLinear = (value, maxValue) => {
  const safeValue = Math.max(0, toNumber(value, 0));
  const safeMax = Math.max(0, toNumber(maxValue, 0));
  if (safeMax <= 0) {
    return 0;
  }
  return clamp(safeValue / safeMax, 0, 1);
};

const normalizeLog = (value, maxValue) => {
  const safeValue = Math.max(0, toNumber(value, 0));
  const safeMax = Math.max(0, toNumber(maxValue, 0));
  if (safeMax <= 0) {
    return 0;
  }

  const denominator = Math.log10(safeMax + 1);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  const numerator = Math.log10(safeValue + 1);
  return clamp(numerator / denominator, 0, 1);
};

const toOrderStatsByProduct = (orderItems) => {
  const aggregated = new Map();

  for (const item of Array.isArray(orderItems) ? orderItems : []) {
    const productId = normalizeIdentifier(item?.product_id);
    if (!productId) {
      continue;
    }

    const orderId = normalizeIdentifier(item?.order_id);
    const quantity = Math.max(0, toNumber(item?.quantity, 0));

    const existing =
      aggregated.get(productId) || { quantity: 0, orderIds: new Set() };
    existing.quantity += quantity;
    if (orderId) {
      existing.orderIds.add(orderId);
    }
    aggregated.set(productId, existing);
  }

  const normalized = new Map();
  for (const [productId, entry] of aggregated.entries()) {
    normalized.set(productId, {
      quantity: roundToTwo(entry.quantity),
      orderCount: entry.orderIds.size,
    });
  }

  return normalized;
};

const computeProductRatings = ({ products, orderStatsByProduct }) => {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeOrderStats =
    orderStatsByProduct instanceof Map ? orderStatsByProduct : new Map();

  const productMetrics = safeProducts.map((product) => {
    const productId = normalizeIdentifier(product?.id);
    const stats = safeOrderStats.get(productId) || {
      quantity: 0,
      orderCount: 0,
    };

    return {
      productId,
      price: Math.max(0, toNumber(product?.Price, 0)),
      quantity: Math.max(0, toNumber(stats.quantity, 0)),
      orderCount: Math.max(0, toNumber(stats.orderCount, 0)),
    };
  });

  const maxPrice = Math.max(...productMetrics.map((entry) => entry.price), 0);
  const maxQuantity = Math.max(
    ...productMetrics.map((entry) => entry.quantity),
    0,
  );
  const maxOrders = Math.max(
    ...productMetrics.map((entry) => entry.orderCount),
    0,
  );

  return productMetrics.map((entry) => {
    const normalizedPrice = normalizeLinear(entry.price, maxPrice);
    const normalizedQuantity = normalizeLog(entry.quantity, maxQuantity);
    const normalizedOrders = normalizeLog(entry.orderCount, maxOrders);

    const rawScore =
      RATING_WEIGHTS.price * normalizedPrice +
      RATING_WEIGHTS.quantity * normalizedQuantity +
      RATING_WEIGHTS.orders * normalizedOrders;

    const boundedScore = clamp(rawScore, 0, 1);
    const finalRating = roundToTwo(1 + 4 * boundedScore);

    return {
      productId: entry.productId,
      rating: finalRating,
      normalized: {
        price: normalizedPrice,
        quantity: normalizedQuantity,
        orders: normalizedOrders,
      },
      source: {
        price: entry.price,
        quantity: entry.quantity,
        orderCount: entry.orderCount,
      },
    };
  });
};

const recalculateAndPersistProductRatings = async ({ supabase, tables }) => {
  const tableNames = tables || {};
  const productsTable = tableNames.products || 'products';
  const ordersTable = tableNames.orders || 'orders';
  const orderItemsTable = tableNames.orderItems || 'order_items';

  const { data: products, error: productsError } = await supabase
    .from(productsTable)
    .select('id, "Price", rating');
  if (productsError) {
    throw new Error(
      productsError.message || 'Unable to load products for rating recalculation.',
    );
  }

  const safeProducts = Array.isArray(products) ? products : [];
  if (safeProducts.length === 0) {
    return { updatedProducts: 0 };
  }

  const { data: orders, error: ordersError } = await supabase
    .from(ordersTable)
    .select('id')
    .in('order_state', RATING_ORDER_STATES);
  if (ordersError) {
    throw new Error(
      ordersError.message || 'Unable to load orders for rating recalculation.',
    );
  }

  const orderIds = (Array.isArray(orders) ? orders : [])
    .map((entry) => normalizeIdentifier(entry?.id))
    .filter(Boolean);

  let orderItems = [];
  if (orderIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from(orderItemsTable)
      .select('order_id, product_id, quantity')
      .in('order_id', orderIds);
    if (itemsError) {
      throw new Error(
        itemsError.message || 'Unable to load order items for rating recalculation.',
      );
    }
    orderItems = Array.isArray(items) ? items : [];
  }

  const orderStatsByProduct = toOrderStatsByProduct(orderItems);
  const computedRatings = computeProductRatings({
    products: safeProducts,
    orderStatsByProduct,
  });

  const currentRatingByProduct = new Map(
    safeProducts.map((entry) => [
      normalizeIdentifier(entry.id),
      toNumber(entry.rating, 0),
    ]),
  );

  let updatedProducts = 0;
  for (const entry of computedRatings) {
    const productId = normalizeIdentifier(entry.productId);
    if (!productId) {
      continue;
    }

    const currentRating = currentRatingByProduct.get(productId);
    if (
      Number.isFinite(currentRating) &&
      Math.abs(currentRating - entry.rating) < 0.001
    ) {
      continue;
    }

    const { error: updateError } = await supabase
      .from(productsTable)
      .update({ rating: entry.rating })
      .eq('id', productId);
    if (updateError) {
      throw new Error(
        updateError.message ||
          `Unable to update rating for product ${productId}.`,
      );
    }
    updatedProducts += 1;
  }

  return { updatedProducts };
};

module.exports = {
  RATING_WEIGHTS,
  RATING_ORDER_STATES,
  normalizeLinear,
  normalizeLog,
  toOrderStatsByProduct,
  computeProductRatings,
  recalculateAndPersistProductRatings,
};
