// types.ts

export type ProcessingStatus = 'idle' | 'splitting' | 'ocr' | 'structuring' | 'success' | 'error';

export interface OcrBlock {
  text: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ParagraphElement {
  type: 'paragraph';
  content: string;
  spacingAfter?: 'small' | 'medium' | 'large'; // New: AI-detected spacing
}

export interface HeadingElement {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: string;
}

export interface TableCell {
  content: string;
}

export type TableRow = TableCell[];

export interface TableElement {
  type: 'table';
  rows: TableRow[];
}

export type StructuredElement = ParagraphElement | HeadingElement | TableElement;

export interface PageData {
  pageNumber: number;
  imageDataUrl: string;
  ocrData?: OcrBlock[];
  structure?: StructuredElement[];
}

export interface ProgressUpdate {
  status: ProcessingStatus;
  message: string;
  processedPages: number;
  totalPages: number;
}
