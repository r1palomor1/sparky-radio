import { Innertube } from 'youtubei.js';

let youtubeInstance = null;
let initializationPromise = null;

export async function getYoutubeClient() {
    if (youtubeInstance) {
        return youtubeInstance;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            console.log('[YT] Initializing shared Innertube singleton session...');
            const start = Date.now();
            youtubeInstance = await Innertube.create();
            console.log(`[YT] Shared Innertube session established in ${Date.now() - start}ms.`);
            initializationPromise = null;
            return youtubeInstance;
        } catch (error) {
            console.error('[YT] Failed to initialize shared Innertube session:', error);
            initializationPromise = null;
            throw error;
        }
    })();

    return initializationPromise;
}
