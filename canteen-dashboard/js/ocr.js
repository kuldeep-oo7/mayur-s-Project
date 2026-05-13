/**
 * ocr.js  —  Thin wrapper around Tesseract.js v7
 *
 * Static assets (worker + WASM core + language data) are ALL served
 * from /tesseract/ — no external CDN required, works fully offline/LAN.
 *
 * Language file: /tesseract/lang/eng.traineddata.gz  (bundled locally)
 */
import { createWorker } from 'tesseract.js';

let workerInstance = null;
let workerReady    = false;
let initPromise    = null;
let activeProgress = null;  // track latest progress callback

// Always use absolute path from origin — works on localhost AND LAN IP
const ORIGIN = window.location.origin;
const BASE   = ORIGIN + '/tesseract/';

const DEFAULT_LANG = 'eng';
const OPTIONAL_LANGS = ['guj'];

const TESSERACT_OPTIONS = {
    workerPath:    BASE + 'worker.min.js',
    corePath:      BASE,                        // directory — Tesseract appends variant filename
    langPath:      BASE + 'lang',               // local lang file — no CDN needed
    cacheMethod:   'none',                      // don't rely on IndexedDB — load fresh from local disk
    workerBlobURL: false,                       // required when workerPath is explicit
};

async function detectWorkerLang() {
    const available = [DEFAULT_LANG];
    for (const lang of OPTIONAL_LANGS) {
        try {
            const response = await fetch(`${BASE}lang/${lang}.traineddata.gz`, { method: 'HEAD', cache: 'no-store' });
            if (response.ok) available.push(lang);
        } catch {
            // Ignore; retain default language
        }
    }
    return available.join('+');
}

/**
 * Lazily initialises one Tesseract worker (English).
 * Reuses the same worker across calls. Resets if terminated.
 */
async function getWorker(onProgress) {
    // Update progress callback for the current call
    activeProgress = onProgress || null;

    if (workerInstance && workerReady) return workerInstance;

    // If already initialising, wait — don't spawn a second worker
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const lang = await detectWorkerLang();
            const w = await createWorker(lang, 1, {
                ...TESSERACT_OPTIONS,
                logger: m => {
                    if (!activeProgress) return;
                    if (m.status === 'loading tesseract core') {
                        activeProgress(Math.round(m.progress * 25));         // 0→25%
                    } else if (m.status === 'loading language traineddata') {
                        activeProgress(25 + Math.round(m.progress * 25));    // 25→50%
                    } else if (m.status === 'initializing api') {
                        activeProgress(50 + Math.round(m.progress * 15));    // 50→65%
                    } else if (m.status === 'recognizing text') {
                        activeProgress(65 + Math.round(m.progress * 35));    // 65→100%
                    }
                },
            });
            workerInstance = w;
            workerReady    = true;
            return w;
        } catch (err) {
            // Reset so next call retries
            initPromise    = null;
            workerInstance = null;
            workerReady    = false;
            throw err;
        }
    })();

    return initPromise;
}

/**
 * Convert a Blob or File to a base64 data URL.
 * The Tesseract WASM worker runs in a separate thread and CANNOT access
 * blob:// URLs created in the main thread — base64 is embedded in the
 * postMessage payload, so no cross-thread fetch is needed.
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);   // "data:image/png;base64,..."
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Run OCR on an image.
 *
 * @param {string|File|Blob|HTMLImageElement|HTMLCanvasElement} source
 * @param {function(number):void} [onProgress]   0-100
 * @returns {Promise<string>}
 */
export async function runOCR(source, onProgress) {
    onProgress?.(0);

    // Always convert Blob/File → base64 data URL before sending to the worker.
    // blob:// URLs are NOT accessible inside the WASM worker context — they
    // cause "Error in pixReadStream" / "Image file /input cannot be read".
    let imgSrc = source;
    if (source instanceof File || source instanceof Blob) {
        imgSrc = await blobToBase64(source);
    }

    const worker = await getWorker(onProgress);
    const { data } = await worker.recognize(imgSrc);
    onProgress?.(100);
    return data.text;
}

/**
 * Terminate the worker to free memory.
 * Called by the router when leaving the scanner page.
 */
export async function terminateOCR() {
    if (workerInstance && workerReady) {
        await workerInstance.terminate().catch(() => {});
        workerInstance = null;
        workerReady    = false;
        initPromise    = null;
    }
}
