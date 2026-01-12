# TAB1-ORDERS.HTML - Documentation Chi Tiết

> **File**: `/orders-report/tab1-orders.html`
> **Mục đích**: Trang quản lý đơn hàng chính của hệ thống Orders Report
> **Phiên bản tài liệu**: 2025-01-11 (Updated with line numbers)

---

## 1. TỔNG QUAN

### 1.1 Mô tả
`tab1-orders.html` là **tab chính** của module Orders Report, chịu trách nhiệm:
- Hiển thị và quản lý danh sách đơn hàng từ TPOS API
- Quản lý tag đơn hàng (gán/xóa tag đơn lẻ và hàng loạt)
- Xem và gửi tin nhắn/bình luận Facebook (qua Pancake API)
- Phân chia đơn hàng theo nhân viên (theo STT)
- Quản lý chiến dịch (Campaign) - lọc đơn theo khoảng thời gian
- Tạo phiếu bán hàng (Bill/Invoice) nhanh
- Theo dõi công nợ khách hàng
- Realtime sync qua Firebase và WebSocket

### 1.2 File liên quan

| File | Mô tả |
|------|-------|
| `tab1-orders.js` | Logic chính (~500 hàm) |
| `tab1-orders.css` | Stylesheet chính |
| `api-handler.js` | Xử lý API calls |
| `api-config.js` | Cấu hình API endpoints |
| `auth.js` | Xác thực người dùng |
| `realtime-manager.js` | Quản lý WebSocket realtime |
| `pancake-token-manager.js` | Quản lý Pancake JWT tokens |
| `pancake-data-manager.js` | Quản lý dữ liệu từ Pancake API |
| `chat-products-ui.js` | UI quản lý sản phẩm trong chat |
| `chat-products-actions.js` | Actions cho sản phẩm trong chat |
| `message-template-manager.js` | Quản lý mẫu tin nhắn |
| `quick-reply-manager.js` | Quản lý trả lời nhanh |
| `dropped-products-manager.js` | Quản lý hàng rớt/xả |
| `held-products-manager.js` | Quản lý hàng giữ |
| `bill-service.js` | Dịch vụ tạo hóa đơn |
| `kpi-manager.js` | Quản lý KPI |
| `notification-system.js` | Hệ thống thông báo |
| `firebase-image-cache.js` | Cache hình ảnh Firebase |
| `product-search-manager.js` | Tìm kiếm sản phẩm |
| `standard-price-manager.js` | Quản lý giá chuẩn |

---

## 2. DANH SÁCH ĐẦY ĐỦ CÁC HÀM TRONG `tab1-orders.js`

> **Tổng cộng: ~500 hàm**
> **Format**: `Dòng | Tên hàm | Mô tả`

### 2.1 SECTION 1: GLOBAL VARIABLES (#GLOBAL) - Dòng 119-277

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 134 | `window.formatTimeVN(dateInput, showFullDate)` | Format thời gian sang múi giờ Việt Nam (GMT+7) |
| 219 | `window.getChatOrderDetails()` | Getter cho currentChatOrderDetails |
| 222 | `window.setChatOrderDetails(details)` | Setter cho currentChatOrderDetails |
| 244 | `getOrderDetailsFromCache(orderId)` | Lấy chi tiết đơn từ cache |
| 262 | `saveOrderDetailsToCache(orderId, data)` | Lưu chi tiết đơn vào cache |

### 2.2 SECTION 2: FIREBASE & REALTIME TAG SYNC (#FIREBASE) - Dòng 279-610

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 304 | `getFilterPrefsUserId()` | Lấy user ID cho filter preferences |
| 326 | `getFilterPrefsPath()` | Lấy Firebase path cho filter preferences |
| 336 | `saveFilterPreferencesToFirebase(prefs)` | [DEPRECATED] Lưu filter preferences |
| 347 | `loadFilterPreferencesFromFirebase()` | [DEPRECATED] Tải filter preferences |
| 361 | `emitTagUpdateToFirebase(orderId, tags)` | Emit cập nhật tag lên Firebase |
| 419 | `setupTagRealtimeListeners()` | Setup listeners Firebase cho tag updates |
| 481 | `handleRealtimeTagUpdate(updateData, source)` | Xử lý cập nhật tag realtime |
| 530 | `updateTagCellOnly(orderId, orderCode, tags)` | Cập nhật cell tag không render lại bảng |
| 602 | `cleanupTagRealtimeListeners()` | Cleanup tag listeners |
| 614 | `window.testTagListeners()` | Test function cho tag listeners |

### 2.3 KPI BASE FUNCTIONS - Dòng 664-721

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 664 | `preloadKPIBaseStatus()` | Preload KPI base status từ Firebase |
| 694 | `setupKPIBaseRealtimeListener()` | Setup realtime listener cho KPI base |
| 721 | `updateKPIBaseIndicator(orderId, hasBase)` | Cập nhật indicator KPI base |

### 2.4 SECTION 3: INITIALIZATION (#INIT) - Dòng 1099-1330

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 1099 | `initializeApp()` | Khởi tạo ứng dụng chính |
| 1192 | `getCurrentUserId()` | Lấy current user ID |
| 1209 | `loadActiveCampaignId()` | Tải active campaign ID từ Firebase |
| 1236 | `continueAfterCampaignSelect(campaignId)` | Tiếp tục sau khi chọn campaign |
| 1317 | `updateActiveCampaignLabel(name)` | Cập nhật label campaign đang active |

### 2.5 SECTION 4: EMPLOYEE RANGE MANAGEMENT (#EMPLOYEE) - Dòng 1332-1720

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 1332 | `loadAndRenderEmployeeTable()` | Tải và render bảng phân chia nhân viên |
| 1356 | `renderEmployeeTable(users)` | Render bảng nhân viên |
| 1403 | `sanitizeCampaignName(campaignName)` | Sanitize tên campaign |
| 1412 | `applyEmployeeRanges()` | Áp dụng phân chia STT cho nhân viên |
| 1515 | `getEmployeeName(stt)` | Lấy tên nhân viên theo STT |
| 1530 | `populateEmployeeCampaignSelector()` | Populate selector campaign cho employee |
| 1559 | `toggleEmployeeDrawer()` | Đóng/mở drawer nhân viên |
| 1580 | `toggleControlBar()` | Đóng/mở control bar |
| 1601 | `checkAdminPermission()` | Kiểm tra quyền admin |
| 1617 | `normalizeEmployeeRanges(data)` | Normalize employee ranges data |
| 1640 | `loadEmployeeRangesForCampaign(campaignName)` | Tải employee ranges cho campaign |
| 1700 | `syncEmployeeRanges()` | Sync employee ranges |

### 2.6 SECTION 5: TAG MANAGEMENT (#TAG) - Dòng 1724-2800

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 1724 | `fetchAllTagsWithPagination(headers)` | Fetch tất cả tags với pagination |
| 1794 | `loadAvailableTags()` | Tải danh sách tag từ API |
| 1822 | `refreshTags()` | Refresh danh sách tags |
| 1890 | `openCreateTagModal()` | Mở modal tạo tag mới |
| 1926 | `closeCreateTagModal()` | Đóng modal tạo tag |
| 1934 | `generateRandomColor()` | Tạo màu ngẫu nhiên |
| 1945 | `autoCreateAndAddTag(tagName)` | Tự động tạo và thêm tag |
| 2045 | `loadCurrentUserIdentifier()` | Tải identifier của user hiện tại |
| 2080 | `quickAssignTag(orderId, orderCode, tagPrefix)` | Gán tag nhanh |
| 2282 | `quickRemoveTag(orderId, orderCode, tagId)` | Xóa tag nhanh |
| 2369 | `updateColorPreview()` | Cập nhật preview màu |
| 2398 | `selectPresetColor(color)` | Chọn màu preset |
| 2405 | `createNewTag()` | Tạo tag mới |
| 2536 | `populateTagFilter()` | Populate filter tag |
| 2544 | `openTagModal(orderId, orderCode)` | Mở modal gán tag |
| 2562 | `closeTagModal()` | Đóng tag modal |
| 2570 | `renderTagList(searchQuery)` | Render danh sách tag |
| 2608 | `toggleTag(tagId)` | Toggle chọn tag |
| 2623 | `updateSelectedTagsDisplay()` | Cập nhật hiển thị tags đã chọn |
| 2647 | `filterTags()` | Lọc tags |
| 2651 | `removeTag(index)` | Xóa tag theo index |
| 2660 | `handleTagInputKeydown(event)` | Xử lý keydown trong tag input |
| 2704 | `toggleQuickAccess(tagName, buttonElement)` | Toggle quick access cho tag |
| 2730 | `saveOrderTags()` | Lưu tags của đơn hàng |
| 2806 | `parseBulkSTTInput(input)` | Parse input STT hàng loạt |

### 2.7 SECTION 6: BULK TAG MODAL (#BULK-TAG) - Dòng 2854-4160

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 2854 | `saveBulkTagToLocalStorage()` | Lưu bulk tag vào localStorage |
| 2871 | `loadBulkTagFromLocalStorage()` | Tải bulk tag từ localStorage |
| 2904 | `clearBulkTagLocalStorage()` | Xóa bulk tag localStorage |
| 2914 | `showBulkTagModal()` | Hiển thị modal gán tag hàng loạt |
| 2940 | `closeBulkTagModal()` | Đóng modal bulk tag |
| 2952 | `loadBulkTagModalOptions()` | Tải options cho bulk tag modal |
| 2965 | `populateBulkTagModalDropdown()` | Populate dropdown bulk tag |
| 3048 | `showBulkTagModalDropdown()` | Hiển thị dropdown |
| 3055 | `refreshBulkTagModalDropdown()` | Refresh dropdown |
| 3086 | `filterBulkTagModalOptions()` | Lọc options |
| 3093 | `handleBulkTagModalSearchKeydown(event)` | Xử lý keydown search |
| 3118 | `autoCreateAndAddTagToBulkModal(tagName)` | Tự động tạo tag cho bulk modal |
| 3206 | `addTagToBulkTagModal(tagId, tagName, tagColor)` | Thêm tag vào bulk modal |
| 3233 | `removeTagFromBulkTagModal(tagId)` | Xóa tag khỏi bulk modal |
| 3243 | `clearAllBulkTagRows()` | Xóa tất cả rows |
| 3261 | `updateBulkTagModalRowCount()` | Cập nhật số lượng rows |
| 3267 | `toggleBulkTagSelectAll(checked)` | Toggle chọn tất cả |
| 3282 | `toggleBulkTagRowSelection(tagId)` | Toggle chọn row |
| 3297 | `updateSelectAllCheckbox()` | Cập nhật checkbox select all |
| 3317 | `addSTTToBulkTagRow(tagId, inputElement)` | Thêm STT vào row |
| 3366 | `handleBulkTagSTTInputKeydown(event, tagId)` | Xử lý keydown STT input |
| 3374 | `removeSTTFromBulkTagRow(tagId, stt)` | Xóa STT khỏi row |
| 3390 | `updateBulkTagModalTable()` | Cập nhật bảng bulk tag |
| 3480 | `normalizePhoneForBulkTag(phone)` | Normalize phone cho bulk tag |
| 3491 | `executeBulkTagModalAssignment()` | Thực hiện gán tag hàng loạt |
| 3824 | `saveBulkTagHistory(results)` | Lưu lịch sử bulk tag |
| 3866 | `showBulkTagResultModal(successResults, failedResults)` | Hiển thị modal kết quả |
| 3983 | `closeBulkTagResultModal()` | Đóng modal kết quả |
| 3992 | `showBulkTagHistoryModal()` | Hiển thị modal lịch sử |
| 4042 | `renderBulkTagHistoryItem(entry, index)` | Render item lịch sử |
| 4118 | `toggleBulkTagHistoryItem(index)` | Toggle item lịch sử |
| 4126 | `closeBulkTagHistoryModal()` | Đóng modal lịch sử |

### 2.8 BULK TAG DELETE FUNCTIONS - Dòng 4163-5185

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 4163 | `saveBulkTagDeleteToLocalStorage()` | Lưu bulk delete vào localStorage |
| 4180 | `loadBulkTagDeleteFromLocalStorage()` | Tải bulk delete từ localStorage |
| 4213 | `clearBulkTagDeleteLocalStorage()` | Xóa bulk delete localStorage |
| 4223 | `showBulkTagDeleteModal()` | Hiển thị modal xóa tag hàng loạt |
| 4249 | `closeBulkTagDeleteModal()` | Đóng modal |
| 4261 | `loadBulkTagDeleteModalOptions()` | Tải options |
| 4274 | `populateBulkTagDeleteModalDropdown()` | Populate dropdown |
| 4357 | `showBulkTagDeleteModalDropdown()` | Hiển thị dropdown |
| 4364 | `refreshBulkTagDeleteModalDropdown()` | Refresh dropdown |
| 4395 | `filterBulkTagDeleteModalOptions()` | Lọc options |
| 4402 | `handleBulkTagDeleteModalSearchKeydown(event)` | Xử lý keydown |
| 4423 | `addTagToBulkTagDeleteModal(tagId, tagName, tagColor)` | Thêm tag |
| 4450 | `removeTagFromBulkTagDeleteModal(tagId)` | Xóa tag |
| 4460 | `clearAllBulkTagDeleteRows()` | Xóa tất cả rows |
| 4478 | `updateBulkTagDeleteModalRowCount()` | Cập nhật số lượng |
| 4484 | `toggleBulkTagDeleteSelectAll(checked)` | Toggle select all |
| 4499 | `toggleBulkTagDeleteRowSelection(tagId)` | Toggle row selection |
| 4514 | `updateBulkTagDeleteSelectAllCheckbox()` | Cập nhật checkbox |
| 4534 | `addSTTToBulkTagDeleteRow(tagId, inputElement)` | Thêm STT |
| 4583 | `handleBulkTagDeleteSTTInputKeydown(event, tagId)` | Xử lý keydown |
| 4591 | `removeSTTFromBulkTagDeleteRow(tagId, stt)` | Xóa STT |
| 4607 | `updateBulkTagDeleteModalTable()` | Cập nhật bảng |
| 4696 | `executeBulkTagDeleteModalRemoval()` | Thực hiện xóa hàng loạt |
| 4901 | `saveBulkTagDeleteHistory(results)` | Lưu lịch sử |
| 4943 | `showBulkTagDeleteResultModal(successResults, failedResults)` | Hiển thị kết quả |
| 5032 | `closeBulkTagDeleteResultModal()` | Đóng modal kết quả |
| 5041 | `showBulkTagDeleteHistoryModal()` | Hiển thị lịch sử |
| 5091 | `renderBulkTagDeleteHistoryItem(entry, index)` | Render item |
| 5167 | `toggleBulkTagDeleteHistoryItem(index)` | Toggle item |
| 5175 | `closeBulkTagDeleteHistoryModal()` | Đóng modal |

### 2.9 SECTION 7: TABLE SEARCH & FILTERING (#SEARCH) - Dòng 5187-5660

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 5187 | `handleTableSearch(query)` | Xử lý tìm kiếm bảng |
| 5201 | `mergeOrdersByPhone(orders)` | Gộp đơn theo SĐT |
| 5366 | `performTableSearch()` | Thực hiện tìm kiếm |
| 5581 | `matchesSearchQuery(order, query)` | Kiểm tra order khớp query |
| 5601 | `removeVietnameseTones(str)` | Xóa dấu tiếng Việt |
| 5610 | `updateSearchResultCount()` | Cập nhật số kết quả |
| 5616 | `copyPhoneNumber(phone)` | Copy số điện thoại |
| 5623 | `highlightSearchText(text, query)` | Highlight text tìm kiếm |
| 5629 | `escapeRegex(string)` | Escape regex |
| 5636 | `formatDateTimeLocal(date)` | Format datetime local |
| 5645 | `convertToUTC(dateTimeLocal)` | Convert sang UTC |

### 2.10 CAMPAIGN FUNCTIONS - Dòng 5661-6250

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 5661 | `handleLoadCampaigns()` | Xử lý tải campaigns |
| 5679 | `loadCampaignList(skip, startDateLocal, endDateLocal, autoLoad)` | Tải danh sách campaign |
| 5741 | `extractCampaignDate(campaignName)` | Extract date từ campaign name |
| 5869 | `populateCampaignFilter(campaigns, autoLoad)` | Populate filter campaign |
| 6060 | `handleCampaignChange()` | Xử lý thay đổi campaign |
| 6138 | `handleCustomDateChange()` | Xử lý thay đổi custom date |
| 6187 | `handleCustomEndDateChange()` | Xử lý thay đổi end date |
| 6219 | `reloadTableData()` | Reload dữ liệu bảng |
| 6246 | `handleSearch()` | Trigger tìm kiếm |

### 2.11 SECTION 8: FETCH & RENDER (#RENDER) - Dòng 6307-7900

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 6307 | `fetchOrders()` | Fetch đơn hàng từ API |
| 6553 | `assignEmptyCartTagToSelected()` | Gán tag "Giỏ rỗng" cho đơn đã chọn |
| 6758 | `updateOrderInTable(orderId, updatedOrderData)` | Cập nhật đơn trong bảng |
| 6834 | `applySorting()` | Áp dụng sắp xếp |
| 6896 | `handleSortClick(column)` | Xử lý click sort |
| 6930 | `updateSortIcons()` | Cập nhật icons sort |
| 6969 | `resetSorting()` | Reset sorting |
| 6978 | `initSortableHeaders()` | Khởi tạo sortable headers |
| 7005 | `renderTable()` | Render bảng đơn hàng chính |
| 7043 | `renderAllOrders()` | Render tất cả đơn |
| 7101 | `handleTableScroll(e)` | Xử lý scroll bảng |
| 7110 | `loadMoreRows()` | Tải thêm rows |
| 7164 | `renderByEmployee()` | Render theo nhân viên |
| 7327 | `createRowHTML(order)` | Tạo HTML cho 1 hàng |
| 7438 | `formatMessagePreview(chatInfo)` | Format preview tin nhắn |
| 7483 | `renderMultiCustomerMessages(order, columnType)` | Render tin nhắn nhiều khách |
| 7545 | `renderSingleCustomerMessage(order, columnType)` | Render tin nhắn 1 khách |
| 7571 | `renderMessagesColumn(order)` | Render cột tin nhắn |
| 7616 | `renderCommentsColumn(order)` | Render cột bình luận |
| 7659 | `renderMergedMessagesColumn(order, columnType)` | Render cột tin nhắn gộp |
| 7741 | `renderMergedQuantityColumn(order)` | Render cột số lượng gộp |
| 7765 | `renderMergedTotalColumn(order)` | Render cột tổng tiền gộp |
| 7789 | `renderChatColumnWithData(order, chatInfo, channelId, psid, columnType)` | Render cột chat với data |
| 7861 | `parseOrderTags(tagsJson, orderId, orderCode)` | Parse tags của đơn |
| 7883 | `formatPartnerStatus(statusText, partnerId)` | Format status đối tác |

### 2.12 STATUS MODAL FUNCTIONS - Dòng 7917-8130

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 7917 | `openPartnerStatusModal(partnerId, currentStatus)` | Mở modal status đối tác |
| 7940 | `closePartnerStatusModal()` | Đóng modal |
| 7945 | `updatePartnerStatus(partnerId, color, text)` | Cập nhật status đối tác |
| 8000 | `openOrderStatusModal(orderId, currentStatus)` | Mở modal status đơn |
| 8023 | `closeOrderStatusModal()` | Đóng modal |
| 8028 | `updateOrderStatus(orderId, newValue, newText, newColor)` | Cập nhật status đơn |
| 8081 | `updateStats()` | Cập nhật thống kê |
| 8115 | `updatePageInfo()` | Cập nhật thông tin trang |
| 8127 | `sendDataToTab2()` | Gửi data sang Tab2 |

### 2.13 SELECTION & UI FUNCTIONS - Dòng 8155-8360

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 8155 | `isOrderSelectable(orderId)` | Kiểm tra đơn có thể chọn |
| 8186 | `handleSelectAll()` | Xử lý chọn tất cả |
| 8233 | `updateActionButtons()` | Cập nhật nút thao tác |
| 8258 | `handleClearCache()` | Xử lý xóa cache |
| 8271 | `showLoading(show)` | Hiển thị loading |
| 8275 | `showInfoBanner(text)` | Hiển thị banner thông tin |
| 8282 | `showSaveIndicator(type, message)` | Hiển thị indicator lưu |
| 8334 | `toggleMergedEditDropdown(button, event)` | Toggle dropdown edit merged |
| 8349 | `closeMergedEditDropdown()` | Đóng dropdown |

### 2.14 SECTION 10: EDIT MODAL (#EDIT) - Dòng 8362-9340

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 8362 | `openEditModal(orderId)` | Mở modal sửa đơn hàng |
| 8380 | `fetchOrderData(orderId)` | Fetch data đơn hàng |
| 8396 | `updateModalWithData(data)` | Cập nhật modal với data |
| 8412 | `switchEditTab(tabName)` | Chuyển tab trong edit modal |
| 8424 | `renderTabContent(tabName)` | Render nội dung tab |
| 8444 | `renderInfoTab(data)` | Render tab thông tin |
| 8498 | `updateOrderInfo(field, value)` | Cập nhật thông tin đơn |
| 8511 | `renderProductsTab(data)` | Render tab sản phẩm |
| 8551 | `renderDeliveryTab(data)` | Render tab giao hàng |
| 8554 | `renderLiveTab(data)` | Render tab live |
| 8604 | `renderInvoicesTab(data)` | Render tab hóa đơn |
| 8679 | `renderHistoryTab(data)` | Render tab lịch sử |
| 8710 | `renderInvoiceHistoryTab(data)` | Render tab lịch sử hóa đơn |
| 8744 | `fetchAndDisplayInvoiceHistory(partnerId)` | Fetch và hiển thị lịch sử hóa đơn |
| 8772 | `renderInvoiceHistoryTable(invoices)` | Render bảng lịch sử hóa đơn |
| 8820 | `fetchAndDisplayAuditLog(orderId)` | Fetch và hiển thị audit log |
| 8845 | `renderAuditLogTimeline(auditLogs)` | Render timeline audit log |
| 8946 | `formatAuditDescription(description)` | Format mô tả audit |
| 8987 | `showErrorState(message)` | Hiển thị trạng thái lỗi |
| 8992 | `closeEditModal()` | Đóng modal sửa đơn |
| 9008 | `forceCloseEditModal()` | Force đóng modal |
| 9015 | `printOrder()` | In đơn hàng |
| 9022 | `updateProductQuantity(index, change, value)` | Cập nhật số lượng sản phẩm |
| 9044 | `updateProductNote(index, note)` | Cập nhật ghi chú sản phẩm |
| 9049 | `removeProduct(index)` | Xóa sản phẩm |
| 9072 | `editProductDetail(index)` | Sửa chi tiết sản phẩm |
| 9086 | `saveProductDetail(index)` | Lưu chi tiết sản phẩm |
| 9105 | `cancelProductDetail()` | Hủy sửa chi tiết |
| 9109 | `recalculateTotals()` | Tính lại tổng |
| 9135 | `saveAllOrderChanges()` | Lưu tất cả thay đổi |
| 9243 | `prepareOrderPayload(orderData)` | Chuẩn bị payload cho API |

### 2.15 SECTION 11: INLINE PRODUCT SEARCH (#PRODUCT) - Dòng 9345-9960

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 9345 | `initInlineSearchAfterRender()` | Khởi tạo inline search sau render |
| 9357 | `initInlineProductSearch()` | Khởi tạo tìm kiếm sản phẩm inline |
| 9371 | `performInlineSearch(query)` | Thực hiện tìm kiếm inline |
| 9390 | `displayInlineResults(results)` | Hiển thị kết quả inline |
| 9432 | `hideInlineResults()` | Ẩn kết quả inline |
| 9440 | `highlightProductRow(index)` | Highlight row sản phẩm |
| 9464 | `updateProductItemUI(productId)` | Cập nhật UI item sản phẩm |
| 9526 | `refreshInlineSearchUI()` | Refresh UI inline search |
| 9599 | `addProductToOrderFromInline(productId)` | Thêm sản phẩm từ inline |
| 9762 | `validatePayloadBeforePUT(payload)` | Validate payload trước PUT |
| 9808 | `debugPayloadBeforeSend(payload)` | Debug payload |
| 9959 | `handleFetchConversationsRequest(orders)` | Xử lý fetch conversations |

### 2.16 INTER-TAB COMMUNICATION - Dòng 10031-10190

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 10031 | `sendOrdersDataToTab3()` | Gửi data đơn sang Tab3 |
| 10073 | `sendOrdersDataToOverview()` | Gửi data sang Overview |
| 10187 | `updateReadBadge(isRead)` | Cập nhật badge đã đọc |

### 2.17 SECTION 12: CHAT MODAL & MESSAGING (#CHAT) - Dòng 10210-16300

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 10210 | `updateMarkButton(isRead)` | Cập nhật nút mark |
| 10231 | `autoMarkAsRead(delayMs)` | Tự động đánh dấu đã đọc |
| 10281 | `window.toggleConversationReadState()` | Toggle trạng thái đọc |
| 10353 | `window.setMessageReplyType(type)` | Đặt loại reply |
| 10398 | `window.updateMessageReplyTypeToggle()` | Cập nhật toggle reply type |
| 10427 | `window.updateConversationTypeToggle(type)` | Cập nhật toggle conversation |
| 10461 | `window.switchConversationType(type)` | Chuyển loại conversation |
| 10650 | `window.populateSendPageSelector(currentPageId)` | Populate selector page gửi |
| 10716 | `window.onSendPageChanged(pageId)` | Xử lý đổi page gửi |
| 10739 | `window.populateChatPageSelector(currentPageId)` | Populate selector page chat |
| 10804 | `window.onChatPageChanged(pageId)` | Xử lý đổi page chat |
| 10831 | `window.reloadChatForSelectedPage(pageId)` | Reload chat cho page |
| 10947 | `formatConversationTimeAgo(timestamp)` | Format thời gian conversation |
| 10965 | `window.populateConversationSelector(conversations, selectedConvId)` | Populate selector conversation |
| 11027 | `window.onChatConversationChanged(conversationId)` | Xử lý đổi conversation |
| 11056 | `window.reloadChatForSelectedConversation(conversation)` | Reload chat cho conversation |
| 11216 | `window.hideConversationSelector()` | Ẩn conversation selector |
| 11227 | `window.openAvatarZoom(avatarUrl, senderName)` | Mở zoom avatar |
| 11301 | `window.closeAvatarZoom()` | Đóng zoom avatar |
| 11309 | `window.openChatModal(orderId, channelId, psid, type)` | Mở modal chat |
| 11919 | `window.closeChatModal()` | Đóng modal chat |
| 12019 | `window.uploadImageWithCache(imageBlob, productId, productName, channelId, productCode)` | Upload ảnh với cache |
| 12131 | `handleChatInputPaste(event)` | Xử lý paste trong chat input |
| 12251 | `handleFileInputChange(event)` | Xử lý thay đổi file input |
| 12342 | `window.updateMultipleImagesPreview()` | Cập nhật preview nhiều ảnh |
| 12435 | `updateSendButtonState()` | Cập nhật trạng thái nút gửi |
| 12464 | `window.updateUploadPreviewUI(success, message, cached)` | Cập nhật UI preview upload |
| 12495 | `window.removeImageAtIndex(index)` | Xóa ảnh theo index |
| 12516 | `window.clearAllImages()` | Xóa tất cả ảnh |
| 12538 | `window.retryUploadAtIndex(index)` | Retry upload ảnh |
| 12596 | `window.retryUpload()` | Retry upload |
| 12630 | `window.clearPastedImage()` | Xóa ảnh đã paste |
| 12653 | `window.sendImageToChat(imageUrl, productName, productId, productCode)` | Gửi ảnh vào chat |
| 12846 | `window.sendProductToChat(productId, productName)` | Gửi sản phẩm vào chat |
| 12899 | `autoResizeTextarea(textarea)` | Tự động resize textarea |
| 12911 | `handleChatInputKeyDown(event)` | Xử lý keydown chat input |
| 12932 | `handleChatInputInput(event)` | Xử lý input chat |
| 12939 | `window.setReplyMessageById(messageId)` | Set reply message theo ID |
| 12951 | `window.setReplyMessage(message)` | Set reply message |
| 13010 | `window.cancelReplyMessage()` | Hủy reply message |
| 13025 | `window.cancelReplyComment()` | Hủy reply comment |
| 13061 | `window.cancelReply()` | Hủy reply |
| 13073 | `extractMessageText(message)` | Extract text từ message |
| 13090 | `window.showChatSendingIndicator(text, queueCount)` | Hiển thị indicator đang gửi |
| 13109 | `window.hideChatSendingIndicator()` | Ẩn indicator |
| 13119 | `processChatMessageQueue()` | Xử lý queue tin nhắn |
| 13163 | `splitMessageIntoParts(message, maxLength)` | Chia tin nhắn thành parts |
| 13205 | `window.sendMessage()` | Gửi tin nhắn Messenger |
| 13343 | `window.sendComment()` | Gửi bình luận |
| 13460 | `window.sendReplyComment()` | Gửi reply comment |
| 13479 | `getImageDimensions(blob)` | Lấy kích thước ảnh |
| 13512 | `tryPancakeUnlock(pageId, conversationId)` | Thử unlock Pancake |
| 13620 | `sendMessageViaFacebookTag(params)` | Gửi tin nhắn qua Facebook Tag |
| 13780 | `window.show24hFallbackPrompt(messageText, pageId, psid)` | Hiển thị prompt 24h fallback |
| 13825 | `window.close24hFallbackModal()` | Đóng modal 24h fallback |
| 13830 | `window.sendViaFacebookTagFromModal(encodedMessage, pageId, psid, imageUrls)` | Gửi qua Facebook Tag từ modal |
| 13885 | `window.switchToCommentMode()` | Chuyển sang mode comment |
| 13897 | `sendMessageInternal(messageData)` | Gửi tin nhắn internal |
| 14404 | `sendCommentInternal(commentData)` | Gửi comment internal |
| 14654 | `handleReplyToComment(commentId, postId)` | Xử lý reply comment |
| 14767 | `renderChatMessages(messages, scrollToBottom)` | Render tin nhắn chat |
| 15260 | `renderComments(comments, scrollToBottom)` | Render bình luận |
| 15609 | `showNewMessageIndicator()` | Hiển thị indicator tin mới |
| 15677 | `setupNewMessageIndicatorListener()` | Setup listener tin mới |
| 15707 | `setupRealtimeMessages()` | Setup realtime messages |
| 15728 | `handleRealtimeConversationEvent(event)` | Xử lý event realtime |
| 15799 | `startRealtimePolling()` | Bắt đầu polling realtime |
| 15840 | `fetchAndUpdateMessages()` | Fetch và cập nhật messages |
| 15931 | `getFacebookPageToken()` | Lấy Facebook page token |
| 15957 | `fetchMessagesFromFacebookAPI(pageToken)` | Fetch tin nhắn từ Facebook |
| 16015 | `playNewMessageSound()` | Phát âm thanh tin mới |
| 16041 | `cleanupRealtimeMessages()` | Cleanup realtime messages |
| 16079 | `window.scrollToMessage(messageId)` | Scroll đến message |
| 16110 | `setupChatInfiniteScroll()` | Setup infinite scroll chat |
| 16121 | `handleChatScroll(event)` | Xử lý scroll chat |
| 16141 | `loadMoreMessages()` | Tải thêm tin nhắn |
| 16209 | `loadMoreComments()` | Tải thêm bình luận |
| 16276 | `window.markChatAsRead()` | Đánh dấu chat đã đọc |

### 2.18 SECTION 14: NOTE ENCODING/DECODING (#ENCODE) - Dòng 16325-16680

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 16325 | `base64UrlDecode(str)` | Decode base64 URL |
| 16339 | `shortChecksum(str)` | Tính checksum ngắn |
| 16354 | `xorDecrypt(encoded, key)` | XOR decrypt |
| 16375 | `decodeProductLine(encoded, expectedOrderId)` | Decode dòng sản phẩm |
| 16460 | `loadNoteSnapshots()` | Tải snapshots ghi chú |
| 16503 | `hasValidEncodedProducts(note, expectedOrderId)` | Kiểm tra sản phẩm mã hóa hợp lệ |
| 16575 | `compareAndUpdateNoteStatus(orders, snapshots)` | So sánh và cập nhật trạng thái |
| 16637 | `saveNoteSnapshots(snapshots)` | Lưu snapshots |
| 16660 | `detectEditedNotes()` | Phát hiện ghi chú đã sửa |
| 16681 | `getFacebookCommentId(comment)` | Lấy Facebook comment ID |
| 16708 | `extractPostId(facebookPostId)` | Extract post ID |

### 2.19 MESSAGE APPEND FUNCTIONS - Dòng 16948-17300

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 16948 | `fetchAndAppendNewMessages(conversation)` | Fetch và append tin mới |
| 17029 | `createMessageElement(msg, chatType)` | Tạo element tin nhắn |
| 17090 | `appendNewMessages(messages, chatType)` | Append tin nhắn mới |
| 17140 | `openQuickAddProductModal()` | Mở modal thêm nhanh sản phẩm |
| 17166 | `closeQuickAddProductModal()` | Đóng modal |
| 17205 | `renderQuickAddSuggestions(products)` | Render gợi ý thêm nhanh |
| 17247 | `addQuickProduct(productId)` | Thêm sản phẩm nhanh |
| 17292 | `removeQuickProduct(index)` | Xóa sản phẩm nhanh |
| 17297 | `updateQuickProductQuantity(index, change)` | Cập nhật số lượng |

### 2.20 CHAT PRODUCTS PANEL - Dòng 17309-18980

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 17309 | `clearSelectedProducts()` | Xóa sản phẩm đã chọn |
| 17314 | `renderQuickAddSelectedProducts()` | Render sản phẩm đã chọn |
| 17370 | `saveSelectedProductsToOrders()` | Lưu sản phẩm vào đơn |
| 17440 | `renderChatProductsPanel()` | Render panel sản phẩm chat |
| 17572 | `renderChatProductsTable()` | Render bảng sản phẩm chat |
| 17684 | `renderProductCard(p, index, isHeld)` | Render card sản phẩm |
| 17884 | `initChatProductSearch()` | Khởi tạo search sản phẩm chat |
| 17926 | `performChatProductSearch(query)` | Thực hiện search |
| 17958 | `displayChatSearchResults(results)` | Hiển thị kết quả search |
| 18094 | `updateChatProductItemUI(productId)` | Cập nhật UI item |
| 18146 | `saveChatProductsToFirebase(orderId, products)` | Lưu sản phẩm vào Firebase |
| 18155 | `addChatProductFromSearch(productId)` | Thêm sản phẩm từ search |
| 18351 | `window.confirmHeldProduct(productId)` | Xác nhận sản phẩm giữ |
| 18554 | `window.deleteHeldProduct(productId)` | Xóa sản phẩm giữ |
| 18620 | `window.updateHeldProductQuantityById(productId, delta, specificValue)` | Cập nhật số lượng SP giữ |
| 18668 | `window.decreaseMainProductQuantityById(productId)` | Giảm số lượng SP chính |
| 18811 | `updateChatProductQuantity(index, delta, specificValue)` | Cập nhật số lượng chat product |
| 18849 | `decreaseMainProductQuantity(index)` | Giảm số lượng SP chính |
| 18979 | `removeChatProduct(index)` | Xóa chat product |

### 2.21 SECTION 15: ORDER MERGE FUNCTIONS (#MERGE) - Dòng 19091-20430

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 19091 | `getOrderDetails(orderId)` | Lấy chi tiết đơn hàng |
| 19125 | `updateOrderWithFullPayload(orderData, newDetails, totalAmount, totalQuantity)` | Cập nhật đơn với full payload |
| 19232 | `executeMergeOrderProducts(mergedOrder)` | Thực hiện merge sản phẩm |
| 19347 | `executeBulkMergeOrderProducts()` | Merge hàng loạt |
| 19485 | `showMergeDuplicateOrdersModal()` | Hiển thị modal merge đơn trùng |
| 19629 | `calculateMergedProductsPreview(orders)` | Tính preview sản phẩm merge |
| 19656 | `renderMergeTagPills(tags)` | Render pills tag merge |
| 19685 | `renderMergeClusters()` | Render clusters merge |
| 19707 | `renderClusterCard(cluster)` | Render card cluster |
| 19793 | `renderProductItem(product)` | Render item sản phẩm |
| 19823 | `toggleMergeClusterSelection(clusterId, checked)` | Toggle chọn cluster |
| 19844 | `toggleSelectAllMergeClusters(checked)` | Toggle chọn tất cả clusters |
| 19867 | `updateSelectAllCheckbox()` | Cập nhật checkbox select all |
| 19887 | `updateConfirmButtonState()` | Cập nhật trạng thái nút confirm |
| 19895 | `closeMergeDuplicateOrdersModal()` | Đóng modal merge |
| 19907 | `confirmMergeSelectedClusters()` | Xác nhận merge clusters đã chọn |
| 20026 | `getMergeHistoryUserInfo()` | Lấy thông tin user lịch sử merge |
| 20055 | `saveMergeHistory(cluster, result, errorResponse)` | Lưu lịch sử merge |
| 20145 | `loadMergeHistory(limit)` | Tải lịch sử merge |
| 20177 | `showMergeHistoryModal()` | Hiển thị modal lịch sử merge |
| 20227 | `renderHistoryEntry(entry, index)` | Render entry lịch sử |
| 20292 | `renderHistoryTagPills(tags)` | Render pills tag lịch sử |
| 20302 | `renderHistoryTable(entry)` | Render bảng lịch sử |
| 20365 | `renderHistoryProductItem(product)` | Render item sản phẩm lịch sử |
| 20392 | `toggleHistoryEntry(index)` | Toggle entry lịch sử |
| 20402 | `closeMergeHistoryModal()` | Đóng modal lịch sử |
| 20410 | `escapeHtml(text)` | Escape HTML |
| 20430 | `ensureMergeTagExists(tagName, color)` | Đảm bảo merge tag tồn tại |

### 2.22 TAG ASSIGNMENT AFTER MERGE - Dòng 20525-20690

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 20525 | `getOrderTagsArray(order)` | Lấy array tags của đơn |
| 20554 | `assignTagsToOrder(orderId, tags)` | Gán tags cho đơn |
| 20592 | `assignTagsAfterMerge(cluster)` | Gán tags sau merge |

### 2.23 SECTION 16: ADDRESS LOOKUP (#ADDRESS) - Dòng 20690-20890

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 20690 | `handleAddressLookup()` | Tra cứu địa chỉ |
| 20781 | `handleFullAddressLookup()` | Tra cứu địa chỉ đầy đủ |
| 20839 | `selectAddress(fullAddress, type)` | Chọn địa chỉ |

### 2.24 PRODUCT STATS MODAL - Dòng 20881-21180

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 20881 | `openProductStatsModal()` | Mở modal thống kê sản phẩm |
| 20893 | `closeProductStatsModal()` | Đóng modal |
| 20911 | `getStatsCampaignId()` | Lấy campaign ID cho stats |
| 20921 | `loadStatsFromFirebase()` | Tải stats từ Firebase |
| 20958 | `saveStatsToFirebase(statsHtml, summaryData)` | Lưu stats vào Firebase |
| 20982 | `runProductStats()` | Chạy thống kê sản phẩm |
| 21149 | `toggleStatsSummary(element)` | Toggle summary stats |

### 2.25 SECTION 17: QR CODE & DEBT FUNCTIONS (#QR-DEBT) - Dòng 21176-22430

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 21176 | `normalizePhoneForQR(phone)` | Normalize phone cho QR |
| 21191 | `getQRCache()` | Lấy cache QR |
| 21205 | `saveQRCache(cache)` | Lưu cache QR |
| 21218 | `generateUniqueCode()` | Tạo mã unique |
| 21230 | `getQRFromCache(phone)` | Lấy QR từ cache |
| 21244 | `saveQRToCache(phone, uniqueCode, synced)` | Lưu QR vào cache |
| 21261 | `syncQRFromBalanceHistory()` | Sync QR từ balance history |
| 21298 | `syncQRToBalanceHistory(phone, uniqueCode)` | Sync QR sang balance history |
| 21332 | `getOrCreateQRForPhone(phone)` | Lấy hoặc tạo QR cho phone |
| 21359 | `copyQRCode(phone)` | Copy mã QR |
| 21400 | `renderQRColumn(phone)` | Render cột QR |
| 21452 | `showNotification(message, type)` | Hiển thị notification |
| 21533 | `generateVietQRUrl(uniqueCode, amount)` | Tạo URL VietQR |
| 21556 | `showOrderQRModal(phone, amount, options)` | Hiển thị modal QR |
| 21628 | `closeOrderQRModal()` | Đóng modal QR |
| 21639 | `copyQRCodeFromModal(uniqueCode)` | Copy QR từ modal |
| 21661 | `copyQRImageUrl(url)` | Copy URL ảnh QR |
| 21689 | `loadQRAmountSetting()` | Tải setting số tiền QR |
| 21723 | `saveQRAmountSetting()` | Lưu setting |
| 21748 | `updateQRAmountToggleUI()` | Cập nhật UI toggle |
| 21764 | `toggleQRAmountSetting()` | Toggle setting |
| 21789 | `copyQRImageFromChat()` | Copy ảnh QR từ chat |
| 21889 | `showQRFromChat()` | Hiển thị QR từ chat |
| 21923 | `loadChatDebt(phone)` | Tải công nợ cho chat |
| 21968 | `updateChatDebtDisplay(debt)` | Cập nhật hiển thị công nợ |
| 22000 | `getDebtCache()` | Lấy cache công nợ |
| 22014 | `saveDebtCache(cache)` | Lưu cache công nợ |
| 22027 | `getCachedDebt(phone)` | Lấy công nợ từ cache |
| 22046 | `saveDebtToCache(phone, totalDebt)` | Lưu công nợ vào cache |
| 22063 | `fetchDebtForPhone(phone)` | Fetch công nợ theo phone |
| 22088 | `formatDebtCurrency(amount)` | Format tiền công nợ |
| 22101 | `renderDebtColumn(phone)` | Render cột công nợ |
| 22130 | `updateDebtCells(phone, debt)` | Cập nhật cells công nợ |
| 22149 | `batchFetchDebts(phones)` | Batch fetch công nợ |
| 22252 | `extractPhoneFromTransaction(transaction)` | Extract phone từ transaction |
| 22276 | `handleDebtTransaction(transaction)` | Xử lý transaction công nợ |
| 22306 | `updateDebtCellsInTable(phone, debt)` | Cập nhật cells trong bảng |
| 22329 | `connectDebtRealtime()` | Kết nối SSE công nợ realtime |
| 22380 | `disconnectDebtRealtime()` | Ngắt kết nối SSE |

### 2.26 DELIVERY CARRIER FUNCTIONS - Dòng 22415-22890

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 22415 | `getCachedDeliveryCarriers()` | Lấy cache đối tác giao hàng |
| 22436 | `saveDeliveryCarriersToCache(carriers)` | Lưu cache |
| 22451 | `fetchDeliveryCarriers()` | Fetch đối tác giao hàng |
| 22537 | `populateDeliveryCarrierDropdown(selectedId)` | Populate dropdown |
| 22588 | `updateSaleCOD()` | Cập nhật COD |
| 22609 | `updateSaleRemainingBalance()` | Cập nhật số dư còn lại |
| 22638 | `smartSelectDeliveryPartner(address, extraAddress)` | Smart select đối tác |
| 22681 | `extractDistrictFromAddress(address, extraAddress)` | Extract quận/huyện từ địa chỉ |
| 22768 | `findMatchingCarrier(select, districtInfo)` | Tìm carrier phù hợp |
| 22852 | `selectCarrierByName(select, namePattern, showWarning)` | Chọn carrier theo tên |
| 22881 | `formatCurrencyVND(amount)` | Format tiền VND |

### 2.27 SECTION 18: SALE MODAL (#SALE-PROD) - Dòng 22892-24870

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 22892 | `openSaleButtonModal()` | Mở modal sale |
| 23044 | `closeSaleButtonModal(clearSelection)` | Đóng modal sale |
| 23074 | `confirmDebtUpdate()` | Xác nhận cập nhật công nợ |
| 23170 | `switchSaleTab(tabName)` | Chuyển tab sale |
| 23195 | `populateSaleModalWithOrder(order)` | Populate modal với order |
| 23248 | `fetchOrderDetailsForSale(orderUuid)` | Fetch chi tiết đơn cho sale |
| 23303 | `populatePartnerData(partner)` | Populate data đối tác |
| 23352 | `fetchDebtForSaleModal(phone)` | Fetch công nợ cho modal sale |
| 23406 | `populateSaleOrderItems(order)` | Populate items đơn hàng |
| 23462 | `populateSaleOrderLinesFromAPI(orderLines)` | Populate order lines từ API |
| 23537 | `updateSaleItemQuantityFromAPI(index, value)` | Cập nhật số lượng từ API |
| 23581 | `removeSaleItemFromAPI(index)` | Xóa item từ API |
| 23629 | `updateSaleTotals(quantity, amount)` | Cập nhật tổng sale |
| 23655 | `updateSaleItemQuantity(index, value)` | Cập nhật số lượng item |
| 23678 | `removeSaleItem(index)` | Xóa sale item |
| 23688 | `formatDateTimeLocal(date)` | Format datetime local |
| 23696 | `formatDateTimeDisplay(date)` | Format datetime hiển thị |
| 23703 | `formatNumber(num)` | Format số |
| 23758 | `initSaleProductSearch()` | Khởi tạo search sản phẩm sale |
| 23788 | `performSaleProductSearch(query)` | Thực hiện search |
| 23825 | `displaySaleProductResults(results)` | Hiển thị kết quả |
| 23880 | `addProductToSaleFromSearch(productId)` | Thêm sản phẩm từ search |
| 24019 | `recalculateSaleTotals()` | Tính lại tổng sale |
| 24040 | `updateSaleOrderWithAPI()` | Cập nhật order qua API |
| 24240 | `confirmAndPrintSale()` | Xác nhận và in |
| 24466 | `formatDateWithTimezone(date)` | Format date với timezone |
| 24496 | `buildFastSaleOrderPayload()` | Build payload fast sale |
| 24774 | `buildOrderLines()` | Build order lines |
| 24868 | `toggleChatRightPanel()` | Toggle panel phải chat |

### 2.28 IMAGE ZOOM & FAST SALE - Dòng 24922-26810

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 24922 | `window.showImageZoom(imageUrl, productName)` | Hiển thị zoom ảnh |
| 24955 | `window.closeImageZoom()` | Đóng zoom ảnh |
| 24989 | `showFastSaleModal()` | Hiển thị modal fast sale |
| 25052 | `closeFastSaleModal()` | Đóng modal fast sale |
| 25065 | `fetchFastSaleOrdersData(orderIds)` | Fetch data fast sale |
| 25127 | `renderFastSaleModalBody()` | Render body modal |
| 25228 | `renderFastSaleOrderRow(order, index, carriers)` | Render row đơn |
| 25339 | `updateFastSaleShippingFee(index)` | Cập nhật phí ship |
| 25356 | `smartSelectCarrierForRow(select, address, extraAddress)` | Smart select carrier |
| 25387 | `collectFastSaleData()` | Thu thập data fast sale |
| 25658 | `confirmFastSale()` | Xác nhận fast sale |
| 25665 | `confirmAndCheckFastSale()` | Xác nhận và check |
| 25673 | `saveFastSaleOrders(isApprove)` | Lưu đơn fast sale |
| 25804 | `preGenerateBillImages()` | Pre-generate ảnh bill |
| 25939 | `showFastSaleResultsModal(results)` | Hiển thị modal kết quả |
| 25981 | `closeFastSaleResultsModal()` | Đóng modal kết quả |
| 26002 | `switchResultsTab(tabName)` | Chuyển tab kết quả |
| 26025 | `renderForcedOrdersTable()` | Render bảng đơn cưỡng bức |
| 26067 | `renderFailedOrdersTable()` | Render bảng đơn thất bại |
| 26107 | `renderSuccessOrdersTable()` | Render bảng đơn thành công |
| 26152 | `toggleAllForcedOrders(checked)` | Toggle tất cả đơn cưỡng bức |
| 26161 | `createForcedOrders()` | Tạo đơn cưỡng bức |
| 26240 | `toggleAllSuccessOrders(checked)` | Toggle tất cả đơn thành công |
| 26250 | `printSuccessOrders(type)` | In đơn thành công |

### 2.29 BILL TEMPLATE SETTINGS - Dòng 26658-26810

| Dòng | Hàm | Mô tả |
|------|-----|-------|
| 26658 | `getBillTemplateSettings()` | Lấy settings template bill |
| 26673 | `openBillTemplateSettings()` | Mở settings template |
| 26684 | `closeBillTemplateSettings()` | Đóng settings |
| 26694 | `switchBillSettingsTab(tabName)` | Chuyển tab settings |
| 26718 | `loadBillSettingsToForm()` | Tải settings vào form |
| 26754 | `saveBillTemplateSettings()` | Lưu settings template |
| 26800 | `resetBillTemplateSettings()` | Reset settings |
| 26809 | `previewBillTemplate()` | Preview template |

---

## 3. DANH SÁCH HÀM TRONG `tab1-orders.html` (INLINE SCRIPTS)

> **Các hàm được định nghĩa trực tiếp trong file HTML**

### 3.1 Campaign Management Functions

| Dòng HTML | Hàm | Mô tả |
|-----------|-----|-------|
| 2510 | `openChatTemplateModal()` | Mở modal mẫu tin nhắn |
| 3252 | `openCampaignSettingsModal()` | Mở modal cài đặt chiến dịch |
| 3261 | `closeCampaignSettingsModal()` | Đóng modal cài đặt |
| 3266 | `syncOriginalToModal()` | Đồng bộ giá trị vào modal |
| 3303 | `autoFillCustomEndDate()` | Tự động điền ngày kết thúc (+3 ngày) |
| 3334 | `applyCampaignSettings()` | Áp dụng cài đặt chiến dịch |
| 3407 | `handleLoadCampaignsFromModal()` | Xử lý tải campaigns từ modal |
| 3412 | `toggleChatAPISourceFromModal()` | Toggle nguồn API từ modal |
| 3431 | `loadUserCampaigns()` | Tải danh sách chiến dịch user |
| 3466 | `applyUserCampaign()` | Áp dụng chiến dịch user |
| 3575 | `openCreateCampaignModal()` | Mở modal tạo chiến dịch |
| 3599 | `closeCreateCampaignModal()` | Đóng modal tạo |
| 3627 | `saveNewCampaign()` | Lưu chiến dịch mới |
| 3740 | `loadAllCampaigns()` | Tải tất cả chiến dịch |
| 3755 | `saveActiveCampaign(campaignId)` | Lưu chiến dịch đang dùng |
| 3779 | `updateCampaignSettingsUI(campaign)` | Cập nhật UI cài đặt |
| 3843 | `getTimeFrameDisplayText(timeFrame)` | Lấy text hiển thị time frame |
| 3863 | `showNoCampaignsModal()` | Hiển thị modal không có chiến dịch |
| 3867 | `closeNoCampaignsModal()` | Đóng modal |
| 3872 | `showSelectCampaignModal()` | Hiển thị modal chọn chiến dịch |
| 3889 | `closeSelectCampaignModal()` | Đóng modal chọn |
| 3894 | `confirmSelectCampaign()` | Xác nhận chọn chiến dịch |
| 3931 | `showCampaignDeletedModal()` | Hiển thị modal campaign bị xóa |
| 3935 | `closeCampaignDeletedModal()` | Đóng modal |
| 3940 | `showCampaignNoDatesModal(campaignId)` | Hiển thị modal campaign không có ngày |
| 3955 | `closeCampaignNoDatesModal()` | Đóng modal |
| 3960 | `saveCampaignDatesAndContinue()` | Lưu ngày và tiếp tục |
| 4013 | `openManageCampaignsModal()` | Mở modal quản lý chiến dịch |
| 4019 | `closeManageCampaignsModal()` | Đóng modal |
| 4023 | `renderManageCampaignsList()` | Render danh sách chiến dịch |
| 4079 | `openEditCampaignModal(campaignId)` | Mở modal sửa chiến dịch |
| 4112 | `autoFillEditCampaignEndDate()` | Tự động điền ngày kết thúc |
| 4124 | `closeEditCampaignModal()` | Đóng modal sửa |
| 4128 | `saveEditCampaign()` | Lưu chỉnh sửa chiến dịch |
| 4195 | `deleteCampaign(campaignId)` | Xóa chiến dịch |

### 3.2 Pancake Settings Functions

| Dòng HTML | Hàm | Mô tả |
|-----------|-----|-------|
| 4589 | `openPancakeSettingsModal()` | Mở modal cài đặt Pancake |
| 4600 | `closePancakeSettingsModal()` | Đóng modal Pancake |
| 4606 | `showAddAccountForm()` | Hiển thị form thêm tài khoản |
| 4613 | `hideAddAccountForm()` | Ẩn form thêm tài khoản |
| 4620 | `validateTokenInput()` | Validate JWT token |
| 4681 | `debugTokenInput()` | Debug token đã nhập |
| 4749 | `refreshAccountsList()` | Refresh danh sách accounts |
| 4834 | `addAccountFromCookie()` | Thêm account từ cookie |
| 4878 | `addAccountManual()` | Thêm account thủ công |
| 4922 | `selectAccount(accountId)` | Chọn account active |
| 4959 | `deleteAccount(accountId)` | Xóa account |
| 4995 | `clearAllPancakeAccounts()` | Xóa tất cả accounts |

### 3.3 Tag Settings Functions

| Dòng HTML | Hàm | Mô tả |
|-----------|-----|-------|
| 5032 | `loadAvailableTags()` | Tải danh sách tag |
| 5069 | `toggleTagFilterDropdown()` | Toggle dropdown lọc tag |
| 5097 | `closeTagFilterDropdown()` | Đóng dropdown |
| 5105 | `populateTagFilterOptions(searchTerm)` | Populate options lọc tag |
| 5157 | `filterTagOptions()` | Lọc tag options |
| 5166 | `selectTagFilterOption(tagId, tagName)` | Chọn tag option |
| 5204 | `getTagSettings()` | Lấy cài đặt tag |
| 5217 | `setTagSettings(settings)` | Lưu cài đặt tag |
| 5229 | `openTagSettingsModal()` | Mở modal cài đặt tag |
| 5245 | `closeTagSettingsModal()` | Đóng modal cài đặt tag |
| 5253 | `renderTagSettingsList(filteredTags)` | Render danh sách cài đặt tag |
| 5300 | `filterTagSettings()` | Lọc tag settings |
| 5320 | `saveTagSettingItem(tagId)` | Lưu cài đặt 1 tag |
| 5357 | `saveTagSettings()` | Lưu tất cả cài đặt tag |
| 5387 | `toggleChatAPISource()` | Chuyển nguồn API chat |
| 5422 | `updateChatAPISourceLabel()` | Cập nhật label nguồn API |
| 5431 | `toggleRealtimeMode(enabled)` | Bật/tắt realtime |
| 5446 | `changeRealtimeMode(mode)` | Đổi mode realtime |
| 5456 | `updateRealtimeCheckbox()` | Cập nhật checkbox realtime |

---

## 4. CÁC MODAL (POPUP) - TỔNG HỢP

| Modal ID | Mô tả | Dòng HTML |
|----------|-------|-----------|
| `chatModal` | Modal xem/gửi tin nhắn/bình luận | ~1000-1560 |
| `editOrderModal` | Modal sửa đơn hàng | ~5554-5584 |
| `bulkTagModal` | Modal gán tag hàng loạt | N/A (trong JS) |
| `bulkTagDeleteModal` | Modal xóa tag hàng loạt | ~2740-2867 |
| `bulkTagDeleteHistoryModal` | Modal lịch sử xóa tag | ~2869-2900 |
| `noCampaignsModal` | Modal không có chiến dịch | ~2902-2923 |
| `selectCampaignModal` | Modal chọn chiến dịch | ~2925-2955 |
| `campaignDeletedModal` | Modal chiến dịch bị xóa | ~2957-2977 |
| `campaignNoDatesModal` | Modal chiến dịch không có ngày | ~2979-3027 |
| `manageCampaignsModal` | Modal quản lý chiến dịch | ~3029-3051 |
| `editCampaignModal` | Modal sửa chiến dịch | ~3053-3112 |
| `campaignSettingsModal` | Modal cài đặt chiến dịch | ~3114-3247 |
| `pancakeSettingsModal` | Modal cài đặt Pancake | ~4479-4584 |
| `employeeDrawer` | Drawer phân chia nhân viên | ~5488-5553 |
| `stickerPickerModal` | Modal chọn emoji/sticker | ~5586-5782 |
| `orderQRModal` | Modal QR chuyển khoản | ~5784-5801 |
| `saleButtonModal` | Modal phiếu bán hàng | ~5803-6048 |
| `imageZoomOverlay` | Overlay zoom ảnh | ~6204-6227 |
| `fastSaleModal` | Modal fast sale | ~6229-6267 |
| `fastSaleResultsModal` | Modal kết quả fast sale | ~6269-6300+ |

---

## 5. FILE CSS VÀ JS LIÊN QUAN

### CSS Files
- `tab1-orders.css` - Stylesheet chính
- `modern.css` - Modern UI styles
- `report-modern.css` - Report styles
- `message-template-modal.css` - Modal mẫu tin nhắn
- `product-highlight.css` - Highlight sản phẩm
- `product-search-styles.css` - Styles tìm kiếm sản phẩm
- `quick-reply-modal.css` - Modal trả lời nhanh

### JS Files (41 files)
| File | Mô tả |
|------|-------|
| `tab1-orders.js` | Logic chính (~27000 dòng) |
| `api-config.js` | Cấu hình API |
| `api-handler.js` | Xử lý API calls |
| `auth.js` | Xác thực |
| `cache.js` | Cache management |
| `chat-products-actions.js` | Actions sản phẩm chat |
| `chat-products-ui.js` | UI sản phẩm chat |
| `column-visibility-manager.js` | Quản lý hiển thị cột |
| `comment-modal.js` | Modal bình luận |
| `config.js` | Cấu hình chung |
| `copy-template-helper.js` | Helper copy template |
| `debug-realtime.js` | Debug realtime |
| `decoding-utility.js` | Utility decode |
| `discount-stats-calculator.js` | Tính thống kê giảm giá |
| `discount-stats-ui.js` | UI thống kê giảm giá |
| `dropped-products-manager.js` | Quản lý hàng rớt |
| `firebase-image-cache.js` | Cache ảnh Firebase |
| `held-products-manager.js` | Quản lý hàng giữ |
| `image-compressor.js` | Nén ảnh |
| `kpi-manager.js` | Quản lý KPI |
| `kpi-statistics-ui.js` | UI thống kê KPI |
| `message-template-manager.js` | Quản lý mẫu tin nhắn |
| `new-messages-notifier.js` | Thông báo tin mới |
| `notification-system.js` | Hệ thống thông báo |
| `order-image-generator.js` | Tạo ảnh đơn hàng |
| `pancake-token-manager.js` | Quản lý token Pancake |
| `pancake-data-manager.js` | Quản lý data Pancake |
| `product-search-manager.js` | Quản lý tìm kiếm SP |
| `quick-fix-console.js` | Console quick fix |
| `quick-reply-manager.js` | Quản lý trả lời nhanh |
| `search-functions.js` | Hàm tìm kiếm |
| `standard-price-manager.js` | Quản lý giá chuẩn |
| `token-manager.js` | Quản lý token |
| `user-employee-loader.js` | Tải nhân viên |
| `user-storage-manager.js` | Quản lý storage user |
| `live-comments-readonly-modal.js` | Modal live comments |
| `realtime-manager.js` | Quản lý realtime |
| `bill-service.js` | Dịch vụ bill |
| `wallet-integration.js` | Tích hợp ví |

---

## 6. THỐNG KÊ

| Loại | Số lượng |
|------|----------|
| Tổng số hàm trong `tab1-orders.js` | ~500 |
| Tổng số hàm trong `tab1-orders.html` | ~65 |
| Tổng số modals | 20+ |
| Tổng số file JS liên quan | 41 |
| Tổng số file CSS liên quan | 7 |
| Tổng số dòng code trong `tab1-orders.js` | ~27000 |

---

## 7. CHANGELOG

| Ngày | Thay đổi |
|------|----------|
| 2025-01-11 | Tạo documentation đầy đủ |
| 2025-01-11 | Cập nhật với số dòng chính xác cho tất cả hàm |

---

*Tài liệu được tạo bởi Claude Code - Anthropic*
