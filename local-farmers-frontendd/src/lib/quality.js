export const getQualityLabel = (score) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return 'unknown';
  }
  if (score < 40) {
    return 'weak';
  }
  if (score < 60) {
    return 'ok';
  }
  if (score < 80) {
    return 'good';
  }
  return 'awsome';
};
