function resolveEventId({
  candidateCategory,
  candidateId,
  categoryEventId,
  urlEventId,
  titleEventId,
  categoriesById = {}
}) {
  const exists = id =>
    Boolean(id) && Object.prototype.hasOwnProperty.call(categoriesById, id);

  const compatible = id =>
    exists(id) && categoriesById[id] === candidateCategory;

  const urlCompatible = urlEventId && compatible(urlEventId);
  const titleCompatible = titleEventId && compatible(titleEventId);
  const candidateCompatible = compatible(candidateId);
  const categoryCompatible = compatible(categoryEventId);

  const candidateOccupiedByOtherCategory =
    exists(candidateId) && !candidateCompatible;

  const categoryOccupiedByOtherCategory =
    exists(categoryEventId) && !categoryCompatible;

  if (!urlCompatible && !titleCompatible && !candidateCompatible &&
      !categoryCompatible && categoryOccupiedByOtherCategory) {
    throw new Error("Category-safe event ID already belongs to another category.");
  }

  return urlCompatible ? urlEventId
    : titleCompatible ? titleEventId
    : candidateCompatible ? candidateId
    : categoryCompatible ? categoryEventId
    : candidateOccupiedByOtherCategory ? categoryEventId
    : candidateId;
}

module.exports = { resolveEventId };
