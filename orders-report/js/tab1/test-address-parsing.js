/**
 * Test Address Parsing Logic
 * Run this in browser console to test extractDistrictFromAddress
 */

(function() {
    'use strict';

    // =====================================================
    // TEST CASES
    // =====================================================

    const testCases = [
        // Good addresses
        { address: "123 Nguyễn Văn Cừ, Phường 4, Quận 5, TP.HCM", expected: { districtNumber: "5", isProvince: false } },
        { address: "456 Lê Văn Sỹ, P.14, Q.3, Hồ Chí Minh", expected: { districtNumber: "3", isProvince: false } },
        { address: "789 CMT8, Phường 11, Quận 10, Sài Gòn", expected: { districtNumber: "10", isProvince: false } },
        { address: "12 Phan Văn Trị, Gò Vấp, HCM", expected: { districtName: "Gò Vấp", isProvince: false } },
        { address: "34 Nguyễn Oanh, Bình Thạnh", expected: { districtName: "Bình Thạnh", isProvince: false } },
        { address: "56 Hoàng Văn Thụ, Tân Bình, TPHCM", expected: { districtName: "Tân Bình", isProvince: false } },

        // Province addresses (should select SHIP TỈNH)
        { address: "123 Trần Hưng Đạo, TP Biên Hòa, Đồng Nai", expected: { isProvince: true, cityName: "dong nai" } },
        { address: "456 Lê Lợi, Thủ Dầu Một, Bình Dương", expected: { isProvince: true, cityName: "binh duong" } },
        { address: "789 Nguyễn Trãi, Đà Lạt, Lâm Đồng", expected: { isProvince: true, cityName: "lam dong" } },
        { address: "Xã An Phú, Huyện Củ Chi, TP.HCM", expected: { districtName: "Củ Chi", isProvince: false } },

        // Bad format addresses (need to handle)
        { address: "66/. 9. Trân  thuận  đông  quân  7. D. 0965157133", expected: { districtNumber: "7", isProvince: false }, note: "Phone mixed in, bad format" },
        { address: "12A đường 3/2 Q.10 HCM 0912345678", expected: { districtNumber: "10", isProvince: false }, note: "Phone at end" },
        { address: "số 5 , ngõ 123 , Q 7 , SG", expected: { districtNumber: "7", isProvince: false }, note: "Extra spaces and commas" },
        { address: "12/3/4 khu phố 2 phường 5 q.8", expected: { districtNumber: "8", isProvince: false }, note: "Lowercase, no city" },
        { address: "abc xyz quan7 hcm", expected: { districtNumber: "7", isProvince: false }, note: "No space in quan7" },
        { address: "P.12 Q.Bình Thạnh TPHCM", expected: { districtName: "Bình Thạnh", isProvince: false }, note: "Q. prefix with name" },
        { address: "hẻm 123 bình thạnh", expected: { districtName: "Bình Thạnh", isProvince: false }, note: "Lowercase district" },

        // Edge cases
        { address: "ấp bình thạnh, xã abc, huyện xyz, Tây Ninh", expected: { isProvince: true, cityName: "tay ninh" }, note: "ấp bình thạnh should NOT match Bình Thạnh district" },
        { address: "1234567890", expected: { districtNumber: null, isProvince: false }, note: "Just phone number" },
        { address: "", expected: null, note: "Empty address" },
        { address: "Q2-12, Bình Tân", expected: { districtName: "Bình Tân", isProvince: false }, note: "Dash format" },
        { address: "Quận 12, HCM", expected: { districtNumber: "12", isProvince: false }, note: "Q12 not Q1" },
        { address: "Quận 1, HCM", expected: { districtNumber: "1", isProvince: false }, note: "Q1 not Q10/Q11/Q12" },
    ];

    // =====================================================
    // RUN TESTS
    // =====================================================

    function runTests() {
        console.log('='.repeat(60));
        console.log('🧪 TESTING ADDRESS PARSING');
        console.log('='.repeat(60));

        let passed = 0;
        let failed = 0;

        for (const testCase of testCases) {
            const result = window.extractDistrictFromAddress(testCase.address, null);

            let isPass = true;
            const issues = [];

            if (testCase.expected === null) {
                if (result !== null) {
                    isPass = false;
                    issues.push(`Expected null, got ${JSON.stringify(result)}`);
                }
            } else {
                if (result === null) {
                    isPass = false;
                    issues.push(`Expected result, got null`);
                } else {
                    // Check district number
                    if (testCase.expected.districtNumber !== undefined) {
                        if (result.districtNumber !== testCase.expected.districtNumber) {
                            isPass = false;
                            issues.push(`districtNumber: expected "${testCase.expected.districtNumber}", got "${result.districtNumber}"`);
                        }
                    }

                    // Check district name
                    if (testCase.expected.districtName !== undefined) {
                        if (result.districtName !== testCase.expected.districtName) {
                            isPass = false;
                            issues.push(`districtName: expected "${testCase.expected.districtName}", got "${result.districtName}"`);
                        }
                    }

                    // Check isProvince
                    if (testCase.expected.isProvince !== undefined) {
                        if (result.isProvince !== testCase.expected.isProvince) {
                            isPass = false;
                            issues.push(`isProvince: expected ${testCase.expected.isProvince}, got ${result.isProvince}`);
                        }
                    }

                    // Check cityName for provinces
                    if (testCase.expected.cityName !== undefined) {
                        const resultCity = (result.cityName || '').toLowerCase();
                        if (!resultCity.includes(testCase.expected.cityName)) {
                            isPass = false;
                            issues.push(`cityName: expected to contain "${testCase.expected.cityName}", got "${result.cityName}"`);
                        }
                    }
                }
            }

            if (isPass) {
                passed++;
                console.log(`✅ PASS: "${testCase.address.substring(0, 40)}..."`);
            } else {
                failed++;
                console.log(`❌ FAIL: "${testCase.address.substring(0, 40)}..."`);
                console.log(`   Note: ${testCase.note || 'N/A'}`);
                console.log(`   Issues: ${issues.join(', ')}`);
                console.log(`   Result:`, result);
            }
        }

        console.log('='.repeat(60));
        console.log(`📊 RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
        console.log('='.repeat(60));

        return { passed, failed, total: testCases.length };
    }

    // =====================================================
    // MANUAL TEST FUNCTION
    // =====================================================

    function testSingleAddress(address) {
        console.log('='.repeat(60));
        console.log('🔍 TESTING ADDRESS:', address);
        console.log('='.repeat(60));

        const result = window.extractDistrictFromAddress(address, null);

        console.log('📋 Result:', result);

        if (result) {
            console.log('  - District Number:', result.districtNumber || '(none)');
            console.log('  - District Name:', result.districtName || '(none)');
            console.log('  - Is Province:', result.isProvince);
            console.log('  - City Name:', result.cityName || '(none)');
        } else {
            console.log('  ⚠️ Could not extract district info');
        }

        return result;
    }

    // =====================================================
    // SIMULATE CARRIER SELECTION
    // =====================================================

    // =====================================================
    // ACTUAL CARRIERS (from TPOS)
    // =====================================================
    const CARRIERS = {
        THANH_PHO_GOP: 'THÀNH PHỐ GỘP',
        TINH_GOP: 'TỈNH GỘP',
        BAN_HANG_SHOP: 'BÁN HÀNG SHOP',
        SHIP_TINH: 'SHIP TỈNH (35.000 đ)',
        THANH_PHO_OUTER1: 'THÀNH PHỐ (Bình Chánh- Q9, Nhà Bè, Hóc Môn) (35.000 đ)',
        THANH_PHO_OUTER2: 'THÀNH PHỐ (Q2-12-Bình Tân-Thủ Đức) (30.000 đ)',
        THANH_PHO_INNER: 'THÀNH PHỐ (1 3 4 5 6 7 8 10 11 Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp,) (20.000 đ)'
    };

    // District mapping based on actual carriers
    const DISTRICT_MAPPING = {
        // Inner city - Q1,3,4,5,6,7,8,10,11 + named districts (20k ship)
        inner: {
            numbers: ['1', '3', '4', '5', '6', '7', '8', '10', '11'],
            names: ['Phú Nhuận', 'Bình Thạnh', 'Tân Phú', 'Tân Bình', 'Gò Vấp'],
            carrier: CARRIERS.THANH_PHO_INNER
        },
        // Outer city 2 - Q2, Q12, Bình Tân, Thủ Đức (30k ship)
        outer2: {
            numbers: ['2', '12'],
            names: ['Bình Tân', 'Thủ Đức'],
            carrier: CARRIERS.THANH_PHO_OUTER2
        },
        // Outer city 1 - Q9, Bình Chánh, Nhà Bè, Hóc Môn (35k ship)
        outer1: {
            numbers: ['9'],
            names: ['Bình Chánh', 'Nhà Bè', 'Hóc Môn', 'Củ Chi', 'Cần Giờ'],
            carrier: CARRIERS.THANH_PHO_OUTER1
        }
    };

    function simulateCarrierSelection(address) {
        console.log('='.repeat(60));
        console.log('🚚 SIMULATING CARRIER SELECTION');
        console.log('   Address:', address);
        console.log('='.repeat(60));

        const result = window.extractDistrictFromAddress(address, null);

        if (!result) {
            console.log('❌ Could not extract district → Default to SHIP TỈNH');
            return CARRIERS.SHIP_TINH;
        }

        if (result.isProvince) {
            console.log(`📍 Province detected: ${result.cityName} → SHIP TỈNH`);
            return CARRIERS.SHIP_TINH;
        }

        // Check district number first
        if (result.districtNumber) {
            const num = result.districtNumber;

            if (DISTRICT_MAPPING.inner.numbers.includes(num)) {
                console.log(`📍 Quận ${num} → Nội thành (20k)`);
                return CARRIERS.THANH_PHO_INNER;
            }
            if (DISTRICT_MAPPING.outer2.numbers.includes(num)) {
                console.log(`📍 Quận ${num} → Ngoại thành 2 (30k)`);
                return CARRIERS.THANH_PHO_OUTER2;
            }
            if (DISTRICT_MAPPING.outer1.numbers.includes(num)) {
                console.log(`📍 Quận ${num} → Ngoại thành 1 (35k)`);
                return CARRIERS.THANH_PHO_OUTER1;
            }
        }

        // Check district name
        if (result.districtName) {
            const name = result.districtName;

            if (DISTRICT_MAPPING.inner.names.includes(name)) {
                console.log(`📍 ${name} → Nội thành (20k)`);
                return CARRIERS.THANH_PHO_INNER;
            }
            if (DISTRICT_MAPPING.outer2.names.includes(name)) {
                console.log(`📍 ${name} → Ngoại thành 2 (30k)`);
                return CARRIERS.THANH_PHO_OUTER2;
            }
            if (DISTRICT_MAPPING.outer1.names.includes(name)) {
                console.log(`📍 ${name} → Ngoại thành 1 (35k)`);
                return CARRIERS.THANH_PHO_OUTER1;
            }
        }

        console.log('⚠️ No match found → Default to SHIP TỈNH');
        return CARRIERS.SHIP_TINH;
    }

    // =====================================================
    // TEST ALL DISTRICTS
    // =====================================================
    function testAllDistricts() {
        console.log('='.repeat(60));
        console.log('🧪 TESTING ALL HCM DISTRICTS');
        console.log('='.repeat(60));

        const testAddresses = [
            // Nội thành - 20k
            { address: 'Q1 HCM', expected: 'Nội thành' },
            { address: 'Quận 3, TPHCM', expected: 'Nội thành' },
            { address: 'Q.4 Sài Gòn', expected: 'Nội thành' },
            { address: 'quan 5 hcm', expected: 'Nội thành' },
            { address: 'Quận 6', expected: 'Nội thành' },
            { address: 'Q7 HCM', expected: 'Nội thành' },
            { address: 'Quận 8', expected: 'Nội thành' },
            { address: 'Q.10 TPHCM', expected: 'Nội thành' },
            { address: 'Quận 11', expected: 'Nội thành' },
            { address: 'Phú Nhuận, HCM', expected: 'Nội thành' },
            { address: 'Bình Thạnh', expected: 'Nội thành' },
            { address: 'Tân Phú, TPHCM', expected: 'Nội thành' },
            { address: 'Tân Bình', expected: 'Nội thành' },
            { address: 'Gò Vấp', expected: 'Nội thành' },

            // Ngoại thành 2 - 30k (Q2, Q12, Bình Tân, Thủ Đức)
            { address: 'Q2 HCM', expected: 'Ngoại thành 2' },
            { address: 'Quận 12, TPHCM', expected: 'Ngoại thành 2' },
            { address: 'Bình Tân', expected: 'Ngoại thành 2' },
            { address: 'Thủ Đức', expected: 'Ngoại thành 2' },

            // Ngoại thành 1 - 35k (Q9, Bình Chánh, Nhà Bè, Hóc Môn)
            { address: 'Quận 9', expected: 'Ngoại thành 1' },
            { address: 'Bình Chánh, HCM', expected: 'Ngoại thành 1' },
            { address: 'Nhà Bè', expected: 'Ngoại thành 1' },
            { address: 'Hóc Môn', expected: 'Ngoại thành 1' },
            { address: 'Củ Chi', expected: 'Ngoại thành 1' },

            // Tỉnh
            { address: 'TP Biên Hòa, Đồng Nai', expected: 'SHIP TỈNH' },
            { address: 'Thủ Dầu Một, Bình Dương', expected: 'SHIP TỈNH' },

            // Edge cases
            { address: '66/. 9. Trân thuận đông quân 7. D. 0965157133', expected: 'Nội thành' },
            { address: 'ấp bình thạnh, xã abc, Tây Ninh', expected: 'SHIP TỈNH' },
        ];

        let passed = 0;
        let failed = 0;

        for (const test of testAddresses) {
            const carrier = simulateCarrierSelection(test.address);
            const isPass = carrier.includes(test.expected) ||
                          (test.expected === 'Nội thành' && carrier.includes('1 3 4 5 6 7 8 10 11')) ||
                          (test.expected === 'Ngoại thành 2' && carrier.includes('Q2-12')) ||
                          (test.expected === 'Ngoại thành 1' && carrier.includes('Q9')) ||
                          (test.expected === 'SHIP TỈNH' && carrier.includes('TỈNH'));

            if (isPass) {
                passed++;
                console.log(`✅ "${test.address}" → ${test.expected}`);
            } else {
                failed++;
                console.log(`❌ "${test.address}" → Expected: ${test.expected}, Got: ${carrier}`);
            }
        }

        console.log('='.repeat(60));
        console.log(`📊 RESULTS: ${passed}/${testAddresses.length} passed`);
        console.log('='.repeat(60));
    }

    // Export for browser console
    window.testAddressParsing = runTests;
    window.testSingleAddress = testSingleAddress;
    window.simulateCarrierSelection = simulateCarrierSelection;
    window.testAllDistricts = testAllDistricts;
    window.addressTestCases = testCases;
    window.CARRIERS = CARRIERS;
    window.DISTRICT_MAPPING = DISTRICT_MAPPING;

    console.log('[TEST] Address parsing test loaded.');
    console.log('  - window.testAddressParsing() - Run all parsing tests');
    console.log('  - window.testAllDistricts() - Test all HCM districts');
    console.log('  - window.testSingleAddress("địa chỉ") - Test single address');
    console.log('  - window.simulateCarrierSelection("địa chỉ") - Simulate carrier selection');
})();
