import brand from "../../../../config/ross-brand.json";

const { product, urls } = brand;

export const rossBrand = {
    name: product.name,
    expandedName: product.expandedName,
    tagline: product.tagline,
    description: product.description,
    betaLabel: product.betaLabel,
    appUrl: urls.app,
    websiteUrl: urls.website,
    termsUrl: `${urls.website}/terms`,
    privacyUrl: `${urls.website}/privacy`,
} as const;
