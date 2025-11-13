// services/gemini.ts
import { PageData, StructuredElement, ParagraphElement, HeadingElement, TableElement } from '../types';

/**
 * Translates the structured content of document pages to a target language.
 * @param pages The original page data with structured content.
 * @param targetLanguage The language to translate the content into.
 * @returns A promise that resolves to the translated page data.
 */
export async function translateStructuredData(pages: PageData[], targetLanguage: string): Promise<PageData[]> {
    // Deep copy of pages to avoid mutating the original data
    const translatedPages: PageData[] = JSON.parse(JSON.stringify(pages));

    for (const page of translatedPages) {
        if (!page.structure || page.structure.length === 0) {
            continue;
        }

        const textsToTranslate: string[] = [];
        
        // Extract all text content from the page's structure
        page.structure.forEach(element => {
            switch (element.type) {
                case 'heading':
                case 'paragraph':
                    textsToTranslate.push((element as HeadingElement | ParagraphElement).content);
                    break;
                case 'table':
                    (element as TableElement).rows.forEach(row => {
                        row.forEach(cell => {
                            textsToTranslate.push(cell.content);
                        });
                    });
                    break;
            }
        });

        if (textsToTranslate.length === 0) {
            continue;
        }

        // Use a unique separator that's unlikely to appear in the text
        const separator = '|||---|||';
        const combinedText = textsToTranslate.join(separator);

        const prompt = `Translate the following text to ${targetLanguage}. The different parts of the text are separated by "${separator}". Preserve this separator in your translation. Only return the translated text. Do not add any introductory text like "Here is the translation:".\n\nText to translate:\n${combinedText}`;

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const translatedCombinedText = await response.text();
            const translatedTexts = translatedCombinedText.split(separator);

            // Check if the number of translated parts matches the original
            if (translatedTexts.length !== textsToTranslate.length) {
                console.warn(`Translation mismatch on page ${page.pageNumber}. Expected ${textsToTranslate.length} parts, but got ${translatedTexts.length}. Falling back to original text for this page.`);
                continue;
            }

            let textIndex = 0;

            // Update the page structure with translated text
            page.structure.forEach(element => {
                if (!element) return;
                switch (element.type) {
                    case 'heading':
                    case 'paragraph':
                        (element as HeadingElement | ParagraphElement).content = translatedTexts[textIndex++].trim();
                        break;
                    case 'table':
                        (element as TableElement).rows.forEach(row => {
                            row.forEach(cell => {
                                cell.content = translatedTexts[textIndex++].trim();
                            });
                        });
                        break;
                }
            });
        } catch (error) {
            console.error(`Error translating page ${page.pageNumber}:`, error);
            // If an API error occurs, continue with untranslated content for this page.
        }
    }

    return translatedPages;
}
