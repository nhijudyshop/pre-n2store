/**
 * Shop Configuration Module
 * Manages multi-shop (NJD Live / NJD Shop) selection
 * Only CompanyId differs between shops - all other TPOS config stays the same
 * Persists selection in localStorage, dispatches 'shopChanged' event on switch
 */

window.ShopConfig = (function() {
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

    console.log('[ShopConfig] Loaded, current shop:', getSelectedShopId());

    return { getSelectedShopId, getConfig, setShop, getShops };
})();
