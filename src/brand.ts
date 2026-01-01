// src/brand.ts
// Dynamic brand loader based on REACT_APP_BRAND environment variable

const brandName = process.env.REACT_APP_BRAND || 'fruit-matjip';

// Dynamically import the selected brand's theme
let theme: any;
let cssVariables: Record<string, string>;
let logo: string;

try {
    // Import theme configuration
    const brandModule = require(`./brand/${brandName}/theme`);
    theme = brandModule.theme;
    cssVariables = brandModule.cssVariables;

    // Import logo
    logo = require(`./brand/${brandName}/logo.png`);
} catch (error) {
    console.error(`Failed to load brand "${brandName}", falling back to fruit-matjip`, error);

    // Fallback to fruit-matjip brand
    const defaultBrand = require('./brand/fruit-matjip/theme');
    theme = defaultBrand.theme;
    cssVariables = defaultBrand.cssVariables;
    logo = require('./brand/fruit-matjip/logo.png');
}

export { theme, cssVariables, logo };

// Helper function to inject CSS variables into the document
export function injectBrandStyles(): void {
    const root = document.documentElement;
    Object.entries(cssVariables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}
