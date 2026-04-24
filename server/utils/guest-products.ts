export type GuestPricedProduct = Record<string, unknown> & {
  price?: unknown;
  promoPrice?: unknown;
  palletPrice?: unknown;
  customPrice?: unknown;
  standardPrice?: unknown;
  hasPriceList?: unknown;
  promotionalOffers?: unknown;
  promoActive?: unknown;
};

export const stripGuestPricingData = <T extends GuestPricedProduct>(product: T): T => {
  product.price = null;
  product.promoPrice = null;
  product.palletPrice = null;
  product.customPrice = undefined;
  product.standardPrice = undefined;
  product.hasPriceList = undefined;
  product.promotionalOffers = [];
  product.promoActive = false;

  return product;
};

export const stripGuestPricingDataFromProducts = <T extends GuestPricedProduct>(products: T[]): T[] => {
  products.forEach(stripGuestPricingData);
  return products;
};