/**
 * Shop Configuration - Multi-company selector (NJD LIVE / NJD SHOP)
 * Load NON-deferred, BEFORE any token-manager script.
 * navigation-modern.js has guard: window.ShopConfig = window.ShopConfig || ...
 */
window.ShopConfig = window.ShopConfig || (function() {
    'use strict';

    const STORAGE_KEY = 'n2store_selected_shop';

    const SHOPS = {
        'njd-live': { id: 'njd-live', label: 'NJD LIVE', CompanyId: 1 },
        'njd-shop': { id: 'njd-shop', label: 'NJD SHOP', CompanyId: 2 }
    };

    function getSelectedShopId() {
        return localStorage.getItem(STORAGE_KEY) || 'njd-live';
    }

    function getConfig() {
        return SHOPS[getSelectedShopId()] || SHOPS['njd-live'];
    }

    function setShop(shopId) {
        if (!SHOPS[shopId]) return;
        const prev = getSelectedShopId();
        if (prev === shopId) return;
        localStorage.setItem(STORAGE_KEY, shopId);
        window.dispatchEvent(new CustomEvent('shopChanged', {
            detail: { shopId, config: SHOPS[shopId], previousShopId: prev }
        }));
    }

    function getShops() {
        return Object.values(SHOPS).map(s => ({ id: s.id, label: s.label }));
    }

    return { getSelectedShopId, getConfig, setShop, getShops };
})();
