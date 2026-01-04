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

// Helper function to update or create a meta tag
function updateMetaTag(attrName: 'name' | 'property', attrValue: string, content: string): void {
    let element = document.querySelector(`meta[${attrName}="${attrValue}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}

// Helper function to update or create a link tag
function updateLinkTag(rel: string, href: string): void {
    let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
    if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', rel);
        document.head.appendChild(element);
    }
    element.href = href;
}

// Helper function to inject CSS variables into the document
export function injectBrandStyles(): void {
    const root = document.documentElement;
    Object.entries(cssVariables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

// Helper function to inject brand metadata into the document
export function injectBrandMetadata(): void {
    const { metadata } = theme;

    // Update document title
    document.title = metadata.title;

    // Update meta tags
    updateMetaTag('name', 'description', metadata.description);
    updateMetaTag('name', 'theme-color', metadata.themeColor);
    updateMetaTag('property', 'og:title', metadata.ogTitle);
    updateMetaTag('property', 'og:description', metadata.ogDescription);
    updateMetaTag('property', 'og:image', logo);

    // Update favicon and icons using the brand-specific logo
    updateLinkTag('icon', logo);
    updateLinkTag('apple-touch-icon', logo);
}
