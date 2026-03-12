// =====================================================
// AI QUEUE MANAGER - Background Processing Queue
// Sequential processing with preview pipeline
// =====================================================

console.log('[QUEUE] AI Queue Manager initialized');

/**
 * AI Queue Manager Class
 * Processes images sequentially in the background
 * Shows preview for first image immediately
 * While user reviews, processes remaining images
 */
class AIQueueManager {
    constructor() {
        this.queue = []; // Array of { file, index, total }
        this.isProcessing = false;
        this.processedResults = new Map(); // index -> { success, data/error }
        this.currentIndex = 0;

        // Callbacks
        this.onProgress = null; // Callback(currentIndex, total, status)
        this.onComplete = null; // Callback(index, result)
        this.onAllComplete = null; // Callback when all images processed
    }

    /**
     * Add batch of files to queue and start processing
     * @param {FileList|File[]} files - Image files to process
     */
    async addBatch(files) {
        console.log(`[QUEUE] Adding ${files.length} files to queue`);

        // Reset state
        this.queue = Array.from(files).map((file, index) => ({
            file,
            index: index + 1, // 1-based index for display
            total: files.length
        }));

        this.processedResults.clear();
        this.currentIndex = 0;

        // Start processing
        this.startProcessing();
    }

    /**
     * Start sequential processing
     */
    async startProcessing() {
        if (this.isProcessing) {
            console.log('[QUEUE] Already processing');
            return;
        }

        if (this.queue.length === 0) {
            console.log('[QUEUE] Queue is empty');
            return;
        }

        this.isProcessing = true;
        console.log(`[QUEUE] Started processing ${this.queue.length} images`);

        // Process each image sequentially
        while (this.queue.length > 0 && this.isProcessing) {
            const item = this.queue.shift();

            console.log(`[QUEUE] Processing image ${item.index}/${item.total}`);

            // Notify progress
            if (this.onProgress) {
                this.onProgress(item.index, item.total, 'processing');
            }

            try {
                // Call AI processor
                const result = await processInvoiceImage(item.file);

                // Add file reference and preview URL
                result.file = item.file;
                result.imageUrl = URL.createObjectURL(item.file);
                result.imageIndex = item.index;
                result.totalImages = item.total;

                // Store result
                this.processedResults.set(item.index, result);

                console.log(`[QUEUE] Image ${item.index} processed:`, result.success ? 'SUCCESS' : 'FAILED');

                // Notify completion
                if (this.onComplete) {
                    this.onComplete(item.index, result);
                }

            } catch (error) {
                console.error(`[QUEUE] Error processing image ${item.index}:`, error);

                const errorResult = {
                    success: false,
                    error: error.message,
                    file: item.file,
                    imageUrl: URL.createObjectURL(item.file),
                    imageIndex: item.index,
                    totalImages: item.total
                };

                this.processedResults.set(item.index, errorResult);

                // Notify completion with error
                if (this.onComplete) {
                    this.onComplete(item.index, errorResult);
                }
            }
        }

        this.isProcessing = false;
        console.log('[QUEUE] All images processed');

        // Notify all complete
        if (this.onAllComplete) {
            this.onAllComplete(this.processedResults);
        }
    }

    /**
     * Get processed result by index
     * @param {number} index - 1-based index
     * @returns {Object|null} Result or null if not processed yet
     */
    getResult(index) {
        return this.processedResults.get(index) || null;
    }

    /**
     * Check if result is ready
     * @param {number} index - 1-based index
     * @returns {boolean} True if result is available
     */
    isResultReady(index) {
        return this.processedResults.has(index);
    }

    /**
     * Get all processed results
     * @returns {Map} Map of index -> result
     */
    getAllResults() {
        return this.processedResults;
    }

    /**
     * Cancel processing
     * Stops the queue and clears pending items
     */
    cancel() {
        console.log('[QUEUE] Cancelling queue');
        this.queue = [];
        this.isProcessing = false;

        // Revoke object URLs to free memory
        this.processedResults.forEach((result) => {
            if (result.imageUrl) {
                URL.revokeObjectURL(result.imageUrl);
            }
        });

        this.processedResults.clear();
    }

    /**
     * Get queue status
     * @returns {Object} Status info
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            queueLength: this.queue.length,
            processedCount: this.processedResults.size,
            currentIndex: this.currentIndex
        };
    }

    /**
     * Cleanup - revoke all object URLs
     * Call this when done with all results
     */
    cleanup() {
        console.log('[QUEUE] Cleaning up object URLs');
        this.processedResults.forEach((result) => {
            if (result.imageUrl) {
                URL.revokeObjectURL(result.imageUrl);
            }
        });
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================

// Create global instance for use across modules
const aiQueueManager = new AIQueueManager();

console.log('[QUEUE] Global instance created: aiQueueManager');
