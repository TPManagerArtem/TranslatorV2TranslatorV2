// services/documentProcessor.ts
import { PageData } from '../types';
import { translateStructuredData } from './gemini';

// NOTE: The main `processDocument` orchestrator has been moved to the Python backend.
// This file now only contains wrappers for client-side operations.

/**
 * A wrapper function that calls the batch translation logic from the Gemini service.
 * This still runs on the client after the structure is received from the backend.
 * @param pages The original page data.
 * @param targetLanguage The language to translate the document content into.
 * @returns A promise that resolves to the translated page data.
 */
export async function translateDocument(pages: PageData[], targetLanguage: string): Promise<PageData[]> {
    return translateStructuredData(pages, targetLanguage);
}
