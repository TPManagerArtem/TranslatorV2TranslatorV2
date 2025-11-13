import os
import asyncio
import json
import base64
import logging
from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Any
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
import fitz
from markdown_it import MarkdownIt
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# --- Configuration ---
DRIVE_DESTINATION_FOLDER_ID = os.getenv("DRIVE_DESTINATION_FOLDER_ID")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("Required environment variable GEMINI_API_KEY is not set.")

SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/documents"]
genai.configure(api_key=GEMINI_API_KEY)
logging.basicConfig(level=logging.INFO)

# --- Initializations ---
app = FastAPI()
md = MarkdownIt('commonmark', {'breaks': True, 'html': False}).enable('table')
safety_settings = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

# --- Pydantic Models ---
class OcrBlock(BaseModel): text: str; x1: float; y1: float; x2: float; y2: float
class PageData(BaseModel): pageNumber: int; structure: List[Any]; imageDataUrl: str
class StructureTranslationRequest(BaseModel): pages: List[PageData]; targetLanguage: str
class CreateDocRequest(BaseModel): pages: List[PageData]; originalFileName: str

async def perform_ocr_on_image_async(image_bytes: bytes, model: genai.GenerativeModel) -> List[OcrBlock]:
    image_part = {"mime_type": "image/png", "data": image_bytes}
    prompt = "Extract all text blocks with their normalized coordinates (x1, y1, x2, y2) from this image. Respond with a JSON array of objects, where each object has 'text', 'x1', 'y1', 'x2', 'y2' keys."
    try:
        response = await model.generate_content_async(
            [prompt, image_part],
            generation_config=genai.types.GenerationConfig(response_mime_type="application/json"),
            safety_settings=safety_settings
        )
        ocr_results = json.loads(response.text)
        return [OcrBlock(**item) for item in ocr_results]
    except Exception as e:
        logging.error(f"OCR on image failed: {e}")
        return []

# --- Core Logic Functions ---
async def get_structure_from_ocr_data_async(ocr_blocks: List[OcrBlock], model: genai.GenerativeModel) -> List[Any]:
    ocr_json_string = json.dumps([block.dict() for block in ocr_blocks])
    structure_prompt = (f"""Based on the following JSON data of OCR text blocks with coordinates, structure the content.\nPay close attention to the coordinates (x1, y1, x2, y2) to infer layout, alignment, and table structures.\nRespond with a JSON array of objects. Each object must have a 'type' key. Supported types are 'heading', 'paragraph', and 'table'.\n- For 'heading', include 'level' (1-6), 'content', and 'align' ('left', 'center', 'right').\n- For 'paragraph', include 'content' and a 'spacingAfter' property ('small', 'medium', or 'large').\n- For 'table', include a 'content' property containing the entire table as a single Markdown-formatted string.\n""" + ocr_json_string)
    try:
        response = await model.generate_content_async(
            structure_prompt,
            generation_config=genai.types.GenerationConfig(response_mime_type="application/json"),
            safety_settings=safety_settings
        )
        return json.loads(response.text)
    except Exception as e:
        logging.error(f"Structuring attempt failed: {e}")
        return [{"type": "paragraph", "content": f"[Structuring failed]"}]

async def process_and_stream_pdf(file: UploadFile):
    try:
        pdf_bytes = await file.read()
        pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(pdf_document)
        ocr_model = genai.GenerativeModel('gemini-2.5-flash')
        structure_model = genai.GenerativeModel('gemini-2.5-flash')

        async def process_single_page_task(page_num: int, page: fitz.Page):
            try:
                pix = page.get_pixmap(dpi=150)
                image_data_url = f"data:image/jpeg;base64,{base64.b64encode(pix.tobytes('jpeg', jpg_quality=85)).decode('utf-8')}"
                
                ocr_blocks: List[OcrBlock] = []
                if any(len(block[4].strip()) > 0 for block in page.get_text("blocks", sort=True)):
                    page_width, page_height = page.rect.width, page.rect.height
                    if page_width > 0 and page_height > 0:
                        for b in page.get_text("blocks", sort=True):
                            x1, y1, x2, y2, text = b[0], b[1], b[2], b[3], b[4]
                            ocr_blocks.append(OcrBlock(text=text, x1=x1/page_width, y1=y1/page_height, x2=x2/page_width, y2=y2/page_height))
                else:
                    ocr_blocks = await perform_ocr_on_image_async(pix.tobytes("png"), ocr_model)

                structure = await get_structure_from_ocr_data_async(ocr_blocks, structure_model) if ocr_blocks else []
                return {"pageNumber": page_num + 1, "structure": structure, "imageDataUrl": image_data_url}
            except Exception as page_error:
                logging.error(f"Error processing page {page_num + 1}: {page_error}")
                return {"pageNumber": page_num + 1, "structure": [{"type": "paragraph", "content": f"[Error processing this page: {page_error}]"}], "imageDataUrl": ""}

        all_pages_data = []
        for i in range(0, total_pages, 4): # Process in batches of 4
            batch_tasks = [process_single_page_task(i + j, pdf_document[i+j]) for j in range(min(4, total_pages - i))]
            results = await asyncio.gather(*batch_tasks)
            all_pages_data.extend(results)
            yield f"data: {json.dumps({'status': 'processing', 'message': f'Processing...', 'page': len(all_pages_data), 'total': total_pages})}\n\n"

        yield f"data: {json.dumps({'status': 'complete', 'data': all_pages_data})}\n\n"
    except Exception as e:
        logging.error(f"Fatal error in process_and_stream_pdf: {e}")
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

# --- API Endpoints ---
@app.post("/api/process_pdf_stream")
async def stream_pdf_processing_endpoint(file: UploadFile = File(...)):
    return StreamingResponse(process_and_stream_pdf(file), media_type="text/event-stream")

@app.post("/api/translate_document")
async def translate_document_endpoint(request: StructureTranslationRequest):
    texts_to_translate, id_map = [], {}
    counter = 0
    for p_idx, page in enumerate(request.pages):
        for e_idx, element in enumerate(page.structure):
            if element.get('content', '').strip():
                texts_to_translate.append({"id": counter, "text": element['content']})
                id_map[counter] = (p_idx, e_idx)
                counter += 1
    if not texts_to_translate: return request.pages
    
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"Translate the 'text' field of each JSON object to {request.targetLanguage}. Return a JSON array with the same 'id's. Preserve Markdown. Input: {json.dumps(texts_to_translate)}"
        response = await model.generate_content_async(prompt, generation_config=genai.types.GenerationConfig(response_mime_type="application/json"), safety_settings=safety_settings)
        translated_map = {item['id']: item['text'] for item in json.loads(response.text)}
        
        for trans_id, translated_text in translated_map.items():
            if trans_id in id_map:
                p_idx, e_idx = id_map[trans_id]
                request.pages[p_idx].structure[e_idx]['content'] = translated_text
        return request.pages
    except Exception as e:
        logging.error(f"Translation failed: {e}")
        return request.pages

@app.post("/api/create_google_doc")
async def create_google_doc_endpoint(request: CreateDocRequest, authorization: str = Header(None)):
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization token.")
        
        token = authorization.split(" ")[1]
        user_creds = Credentials(token=token, scopes=SCOPES)

        docs_service = build('docs', 'v1', credentials=user_creds)
        
        doc = docs_service.documents().create(body={'title': f"Converted_{request.originalFileName}"}).execute()
        doc_id = doc.get('documentId')
        logging.info(f"Created Google Doc with ID: {doc_id} on behalf of the user.")
        
        requests = []
        current_index = 1
        spacing_map = {'small': 8, 'medium': 12, 'large': 16}

        for page in request.pages:
            for element in page.structure:
                content = element.get('content', '')
                if not content.strip(): continue

                if element.get('type') == 'table':
                    tokens = md.parse(content)
                    rows_data = [[]]
                    # Simplified token parsing for brevity
                    for i, token in enumerate(tokens):
                        if token.type == 'tr_open': rows_data.append([])
                        elif token.type == 'inline': rows_data[-1].append(token.content)
                    rows_data = [r for r in rows_data if r]

                    if not rows_data: continue
                    num_rows, num_cols = len(rows_data), max(len(r) for r in rows_data) if rows_data else 0
                    if num_cols == 0: continue

                    requests.append({'insertTable': {'rows': num_rows, 'columns': num_cols, 'location': {'index': current_index}}})
                    
                    table_start_index = current_index
                    cell_requests = []
                    for r, row in enumerate(rows_data):
                        for c, cell_text in enumerate(row):
                            if cell_text:
                                cell_location = table_start_index + 4 + r * (num_cols * 2 + 1) + c * 2
                                cell_requests.append({'insertText': {'text': cell_text, 'location': {'index': cell_location}}})
                    requests.extend(reversed(cell_requests))
                    current_index += (2 + num_rows * (num_cols * 2 + 1))
                else:
                    text_to_insert = content + '\n'
                    requests.append({'insertText': {'text': text_to_insert, 'location': {'index': current_index}}})
                    
                    style_request = {'range': {'startIndex': current_index, 'endIndex': current_index + len(text_to_insert)}, 'paragraphStyle': {}, 'fields': ''}
                    
                    if element.get('type') == 'heading':
                        style_request['paragraphStyle']['namedStyleType'] = f"HEADING_{element.get('level', 1)}"
                        style_request['fields'] += 'namedStyleType'

                    align = element.get('align', 'LEFT').upper()
                    if align in ['CENTER', 'RIGHT', 'JUSTIFIED']:
                        style_request['paragraphStyle']['alignment'] = align
                        style_request['fields'] += ',alignment' if style_request['fields'] else 'alignment'

                    spacing_key = element.get('spacingAfter')
                    if spacing_key in spacing_map:
                        style_request['paragraphStyle']['spaceBelow'] = {'magnitude': spacing_map[spacing_key], 'unit': 'PT'}
                        style_request['fields'] += ',spaceBelow' if style_request['fields'] else 'spaceBelow'

                    if style_request['fields']:
                        requests.append({'updateParagraphStyle': style_request})
                    
                    current_index += len(text_to_insert)
            
            requests.append({'insertPageBreak': {'location': {'index': current_index}}})
            current_index += 1

        if requests:
            docs_service.documents().batchUpdate(documentId=doc_id, body={'requests': requests}).execute()

        return JSONResponse(content={"documentUrl": f"https://docs.google.com/document/d/{doc_id}/edit"})
    except HttpError as err:
        error_details = json.loads(err.content.decode())
        logging.error(f"Google API Error: {error_details}")
        raise HTTPException(status_code=err.resp.status, detail=f"Google API Error: {error_details}")
    except Exception as e:
        logging.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

app.mount("/", StaticFiles(directory="static", html=True), name="static")