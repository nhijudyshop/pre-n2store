// Wait for shared modules to load
import { getAuthManager } from '../../shared/browser/index.js';

// Save referrer before going to report page
window.saveReferrer = function() {
    sessionStorage.setItem('soluongReportReferrer', 'index.html');
};

// Check permissions and auto-redirect if needed
function checkPermissionAndRedirect() {
    try {
        const authManager = getAuthManager();
        const authData = authManager.getAuthData();

        if (!authData || !authData.detailedPermissions) {
            console.log('⚠️ No auth data or permissions, staying on current page');
            return;
        }

        const soluongPerms = authData.detailedPermissions['soluong-live'];
        if (!soluongPerms) {
            console.log('⚠️ No soluong-live permissions defined');
            return;
        }

        const hasLivestream = soluongPerms.livestream === true;
        const hasSocial = soluongPerms.social === true;

        console.log('🔐 Permissions - Livestream:', hasLivestream, 'Social:', hasSocial);

        // If user only has social permission (not livestream), redirect to social page
        if (hasSocial && !hasLivestream) {
            console.log('🔄 Redirecting to social-sales.html (user only has social permission)');
            window.location.href = 'social-sales.html';
            return;
        }

        // If user has neither permission, they shouldn't be here
        if (!hasLivestream && !hasSocial) {
            console.log('⚠️ User has no soluong-live permissions');
        }

        // User has livestream permission, stay on this page
        console.log('✅ User has livestream permission, staying on index.html');

    } catch (error) {
        console.error('Error checking permissions:', error);
    }
}

// Run permission check
checkPermissionAndRedirect();
