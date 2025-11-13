import React, { useState, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import ResultsView from './components/ResultsView';
import DriveFilePicker from './components/DriveFilePicker';
import { PageData, ProgressUpdate } from './types';

const App: React.FC = () => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate>({ status: 'idle', message: '', processedPages: 0, totalPages: 0 });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [originalFileName, setOriginalFileName] = useState('');
  
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [gdocUrl, setGdocUrl] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const handleMessage = (message: string) => {
    if (message.startsWith('data: ')) {
      try {
        const data = JSON.parse(message.substring(6));
        if (data.status === 'processing') {
          setProgress({ status: 'ocr', message: data.message || `Processing page ${data.page}...`, processedPages: data.page, totalPages: data.total });
        } else if (data.status === 'complete') {
          setPages(data.data);
          setProgress({ status: 'success', message: 'Processing Complete!', processedPages: data.data.length, totalPages: data.data.length });
        } else if (data.status === 'error') {
          setError(data.message);
          setProgress({ status: 'error', message: 'An error occurred', processedPages: 0, totalPages: 0 });
        }
      } catch (e) { console.error("Failed to parse JSON from stream:", e); }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setOriginalFileName(file.name.replace(/\.pdf$/i, ''));
    setError(null);
    setPages([]);
    setGdocUrl(null);
    setProgress({ status: 'ocr', message: 'Uploading file...', processedPages: 0, totalPages: 0 });

    const formData = new FormData();
    formData.append('file', file);

    // This streaming logic remains the same
    fetch('/api/process_pdf_stream', { method: 'POST', body: formData })
      .then(response => {
        if (!response.ok || !response.body) throw new Error('Network response was not ok.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = () => {
          reader.read().then(({ done, value }) => {
            if (done) { if (buffer) handleMessage(buffer); return; }
            buffer += decoder.decode(value, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
              handleMessage(buffer.substring(0, boundary));
              buffer = buffer.substring(boundary + 2);
            }
            processStream();
          });
        };
        processStream();
      }).catch(err => {
        setError(`Failed to process file: ${err.message}`);
        setProgress({ status: 'error', message: 'Failed', processedPages: 0, totalPages: 0 });
      });
  };

  const createGoogleDoc = async (token: string) => {
    if (!pages.length) return;
    setIsCreatingDoc(true);
    setGdocUrl(null);
    setError(null);

    try {
      const pagesToProcess = pages;
      
      setProgress({ status: 'ocr', message: 'Creating Google Doc...', processedPages: 0, totalPages: 1 });
      const docResponse = await fetch('/api/create_google_doc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Send the user's token
        },
        body: JSON.stringify({ pages: pagesToProcess, originalFileName })
      });

      if (!docResponse.ok) {
        const errorData = await docResponse.json();
        throw new Error(errorData.detail || 'Failed to create Google Doc.');
      }

      const result = await docResponse.json();
      setGdocUrl(result.documentUrl);
      setProgress(prev => ({ ...prev, status: 'success', message: 'Document created successfully!' }));

    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
      setProgress({ status: 'error', message: 'Failed', processedPages: 0, totalPages: 0 });
    } finally {
      setIsCreatingDoc(false);
    }
  };

  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setUserToken(tokenResponse.access_token);
      createGoogleDoc(tokenResponse.access_token); // Create doc immediately after successful login
    },
    onError: () => {
      setError('Google login failed. Please try again.');
    },
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly' // Request the necessary scopes
  });

  const handleCreateClick = () => {
    if (userToken) {
      createGoogleDoc(userToken);
    } else {
      login();
    }
  };

  const handleSelectFileClick = () => fileInputRef.current?.click();

  const handleReset = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setOriginalFileName('');
    setPages([]);
    setError(null);
    setProgress({ status: 'idle', message: '', processedPages: 0, totalPages: 0 });
    setGdocUrl(null);
    setIsCreatingDoc(false);
    // Keep the user token for subsequent operations
  };

  const isProcessing = progress.status === 'ocr';
  const isActionInProgress = isCreatingDoc;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 flex flex-col items-center p-4 sm:p-8 font-sans">
      <div className="w-full max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-blue-600">PDF-to-DOCX Structural Converter</h1>
          <p className="mt-4 text-lg text-gray-600">Leverage AI to convert any PDF into a fully structured and editable document.</p>
        </header>
        
        <main className="bg-white rounded-lg shadow-xl p-6 ring-1 ring-gray-200 min-h-[300px] flex flex-col justify-center items-center">
          {progress.status === 'idle' && (
            <div 
              className="file-uploader w-full p-10 border-4 border-dashed border-gray-300 hover:border-blue-500 hover:bg-gray-50 rounded-lg text-center cursor-pointer transition-colors duration-300"
              onClick={handleSelectFileClick}
            >
              <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M3 17.25V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75v10.5A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25z" />
              </svg>
              <p className="mt-4 text-xl font-semibold text-gray-700">
                <span className="text-blue-600">Click to upload</span> or drag and drop
              </p>
              <p className="mt-1 text-sm text-gray-500">PDF files only</p>
              <input type="file" accept="application/pdf" onChange={handleFileChange} ref={fileInputRef} className="hidden" aria-label="File uploader" />
            </div>
          )}

          {progress.status === 'idle' && (
            <div className="mt-4">
              <button 
                onClick={() => userToken ? setShowDrivePicker(true) : login()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Select from Google Drive
              </button>
            </div>
          )}

          {showDrivePicker && userToken && (
            <DriveFilePicker
              userToken={userToken}
              onClose={() => setShowDrivePicker(false)}
              onFileSelect={(fileId, fileName) => {
                setShowDrivePicker(false);
                setOriginalFileName(fileName.replace(/\.pdf$/i, ''));
                setError(null);
                setPages([]);
                setGdocUrl(null);
                setProgress({ status: 'ocr', message: 'Downloading file from Google Drive...', processedPages: 0, totalPages: 0 });

                fetch('/api/process_drive_file', { 
                  method: 'POST', 
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                  },
                  body: JSON.stringify({ fileId, fileName })
                })
                .then(response => {
                  if (!response.ok || !response.body) throw new Error('Network response was not ok.');
                  const reader = response.body.getReader();
                  const decoder = new TextDecoder();
                  let buffer = '';

                  const processStream = () => {
                    reader.read().then(({ done, value }) => {
                      if (done) { if (buffer) handleMessage(buffer); return; }
                      buffer += decoder.decode(value, { stream: true });
                      let boundary;
                      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                        handleMessage(buffer.substring(0, boundary));
                        buffer = buffer.substring(boundary + 2);
                      }
                      processStream();
                    });
                  };
                  processStream();
                }).catch(err => {
                  setError(`Failed to process file: ${err.message}`);
                  setProgress({ status: 'error', message: 'Failed', processedPages: 0, totalPages: 0 });
                });
              }}
            />
          )}

          {isProcessing && (
            <div className="progress-indicator w-full text-center">
              <h2 className="text-2xl font-semibold text-blue-600 mb-4">{progress.message}</h2>
              {progress.totalPages > 0 && (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                    <div 
                      className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.processedPages / progress.totalPages) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-gray-600">Page {progress.processedPages} of {progress.totalPages}</p>
                </>
              )}
            </div>
          )}
          
          {error && (
              <div className="error-message w-full text-center bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg" role="alert">
                  <strong className="font-bold text-lg block">An error occurred</strong>
                  <span className="block sm:inline mt-2">{error}</span>
                  <button onClick={handleReset} className="mt-4 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors duration-200">
                    Try another file
                  </button>
              </div>
          )}

          {progress.status === 'success' && (
             <div className="success-container w-full text-center">
               <h2 className="text-3xl font-bold mb-4 text-green-600">Processing Complete!</h2>
               
               {gdocUrl ? (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg mb-6">
                    <strong className="font-bold text-lg block">Document created!</strong>
                    <a href={gdocUrl} target="_blank" rel="noopener noreferrer" className="mt-2 text-blue-600 hover:underline break-all">{gdocUrl}</a>
                  </div>
                ) : (
                  <p className="mb-6 text-gray-600">Your document is ready to be created in Google Docs.</p>
                )}

               <div className="flex justify-center items-center gap-4 flex-wrap">
                    <button onClick={handleCreateClick} disabled={isActionInProgress || !!gdocUrl} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200 disabled:bg-gray-400">
                        {isCreatingDoc ? 'Creating...' : 'Create Google Doc'}
                    </button>
                    <button onClick={handleReset} disabled={isActionInProgress} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200 disabled:opacity-50">
                        Process Another Document
                    </button>
               </div>
             </div>
          )}
        </main>
        
        {pages.length > 0 && <ResultsView pages={pages} />}
      </div>
    </div>
  );
};

export default App;