// src/brand.ts
// Dynamic brand loader based on REACT_APP_BRAND environment variable

const brandName = process.env.REACT_APP_BRAND || 'fruit-matjip';

// Dynamically import the selected brand's theme
let theme: any;
let cssVariables: Record<string, string>;
let logo: string;
let logoText: string;
let defaultKeywordImage: string;

try {
    // Import theme configuration
    const brandModule = require(`./brand/${brandName}/theme`);
    theme = brandModule.theme;
    cssVariables = brandModule.cssVariables;

    // Import logo
    logo = require(`./brand/${brandName}/logo.png`);

    // Import text logo (fallback to main logo if not available)
    try {
        logoText = require(`./brand/${brandName}/logo_text.png`);
    } catch {
        logoText = logo;
    }

    // Import default keyword image (fallback to logo if not available)
    try {
        defaultKeywordImage = require(`./brand/${brandName}/default_keyword.png`);
    } catch {
        defaultKeywordImage = logo;
    }
} catch (error) {
    console.error(`Failed to load brand "${brandName}", falling back to fruit-matjip`, error);

    // Fallback to fruit-matjip brand
    const defaultBrand = require('./brand/fruit-matjip/theme');
    theme = defaultBrand.theme;
    cssVariables = defaultBrand.cssVariables;
    logo = require('./brand/fruit-matjip/logo.png');
    try {
        logoText = require('./brand/fruit-matjip/logo_text.png');
    } catch {
        logoText = logo;
    }
    try {
        defaultKeywordImage = require('./brand/fruit-matjip/default_keyword.png');
    } catch {
        defaultKeywordImage = logo;
    }
}

export { theme, cssVariables, logo, logoText, defaultKeywordImage };

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

    // Use absolute URL for og:image (required for KakaoTalk link preview)
    const ogImageUrl = `${window.location.origin}/og-image.jpg`;
    updateMetaTag('property', 'og:image', ogImageUrl);
    updateMetaTag('property', 'og:image:width', '1200');
    updateMetaTag('property', 'og:image:height', '630');

    // Update favicon and icons using the brand-specific logo
    updateLinkTag('icon', logo);
    updateLinkTag('apple-touch-icon', logo);
}
