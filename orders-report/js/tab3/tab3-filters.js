/**
 * TAB3-FILTERS.JS
 * Product search, variant sorting, assignment filtering.
 *
 * Load order: tab3-filters.js (2nd, after tab3-core.js)
 * Depends on: window._tab3 (from tab3-core.js)
 */
(function () {
    'use strict';

    const { state, utils, data: dataFns, ui } = window._tab3;

    // =====================================================
    // PRODUCT SEARCH
    // =====================================================

    function searchProducts(searchText) {
        if (!searchText || searchText.length < 2) return [];

        const searchNoSign = utils.removeVietnameseTones(searchText);

        return state.productsData.filter(product => {
            const matchName = product.nameNoSign.includes(searchNoSign);
            const matchCode = product.code && product.code.toLowerCase().includes(searchText.toLowerCase());
            return matchName || matchCode;
        }).slice(0, 10);
    }

    function displayProductSuggestions(suggestions) {
        const suggestionsDiv = document.getElementById('productSuggestions');

        if (suggestions.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = suggestions.map(product => `
            <div class="suggestion-item" data-id="${product.id}">
                <span class="product-code">${product.code || 'N/A'}</span>
                <span class="product-name">${product.name}</span>
            </div>
        `).join('');

        suggestionsDiv.classList.add('show');

        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', async () => {
                const productId = item.dataset.id;
                await window._tab3.fn.addProductToAssignment(productId);
                suggestionsDiv.classList.remove('show');
                document.getElementById('productSearch').value = '';
            });
        });
    }

    // =====================================================
    // VARIANT SORTING
    // =====================================================

    function sortVariants(variants) {
        const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

        return [...variants].sort((a, b) => {
            const nameA = a.NameGet || '';
            const nameB = b.NameGet || '';

            const numberMatchA = nameA.match(/\((\d+)\)/);
            const numberMatchB = nameB.match(/\((\d+)\)/);

            if (numberMatchA && numberMatchB) {
                return parseInt(numberMatchA[1]) - parseInt(numberMatchB[1]);
            }

            const sizeMatchA = nameA.match(/\((S|M|L|XL|XXL|XXXL)\)/i);
            const sizeMatchB = nameB.match(/\((S|M|L|XL|XXL|XXXL)\)/i);

            if (sizeMatchA && sizeMatchB) {
                const sizeA = sizeMatchA[1].toUpperCase();
                const sizeB = sizeMatchB[1].toUpperCase();
                const indexA = sizeOrder.indexOf(sizeA);
                const indexB = sizeOrder.indexOf(sizeB);

                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                }
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
            }

            if (numberMatchA && sizeMatchB) return -1;
            if (sizeMatchA && numberMatchB) return 1;

            if ((numberMatchA || sizeMatchA) && !(numberMatchB || sizeMatchB)) return -1;
            if ((numberMatchB || sizeMatchB) && !(numberMatchA || sizeMatchA)) return 1;

            return nameA.localeCompare(nameB);
        });
    }

    // =====================================================
    // ASSIGNMENT FILTER
    // =====================================================

    window.filterAssignments = function (searchText) {
        const searchLower = utils.removeVietnameseTones(searchText.toLowerCase().trim());
        const tableBody = document.getElementById('assignmentTableBody');
        const rows = tableBody.querySelectorAll('tr.assignment-row');
        const countSpan = document.getElementById('assignmentCount');

        if (!searchText || searchText.trim() === '') {
            rows.forEach(row => {
                row.style.display = '';
            });
            countSpan.textContent = state.assignments.length;
            return;
        }

        let visibleCount = 0;

        rows.forEach(row => {
            const assignmentId = parseInt(row.dataset.assignmentId);
            const assignment = state.assignments.find(a => a.id === assignmentId);

            if (!assignment) {
                row.style.display = 'none';
                return;
            }

            const productCodeMatch = assignment.productCode &&
                utils.removeVietnameseTones(assignment.productCode.toLowerCase()).includes(searchLower);

            const productNameMatch = assignment.productName &&
                utils.removeVietnameseTones(assignment.productName.toLowerCase()).includes(searchLower);

            const sttMatch = assignment.sttList && assignment.sttList.some(item =>
                item.stt && item.stt.toString().includes(searchText.trim())
            );

            if (productCodeMatch || productNameMatch || sttMatch) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        if (visibleCount < state.assignments.length) {
            countSpan.textContent = `${visibleCount}/${state.assignments.length}`;
        } else {
            countSpan.textContent = state.assignments.length;
        }
    };

    // =====================================================
    // PRODUCT SEARCH INPUT HANDLER
    // =====================================================

    document.getElementById('productSearch').addEventListener('input', (e) => {
        const searchText = e.target.value.trim();

        if (searchText.length >= 2) {
            if (state.productsData.length === 0) {
                dataFns.loadProductsData().then(() => {
                    const results = searchProducts(searchText);
                    displayProductSuggestions(results);
                });
            } else {
                const results = searchProducts(searchText);
                displayProductSuggestions(results);
            }
        } else {
            document.getElementById('productSuggestions').classList.remove('show');
        }
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) {
            document.getElementById('productSuggestions').classList.remove('show');
        }
    });

    // =====================================================
    // EXPOSE FUNCTIONS
    // =====================================================

    window._tab3.fn.searchProducts = searchProducts;
    window._tab3.fn.displayProductSuggestions = displayProductSuggestions;
    window._tab3.fn.sortVariants = sortVariants;
    window._tab3.fn.filterAssignments = window.filterAssignments;

})();
