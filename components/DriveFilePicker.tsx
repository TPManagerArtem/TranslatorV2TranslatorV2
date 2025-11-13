import React, { useState, useEffect } from 'react';

interface DriveFile {
  id: string;
  name: string;
}

interface DriveFilePickerProps {
  userToken: string | null;
  onFileSelect: (fileId: string, fileName: string) => void;
  onClose: () => void;
}

const DriveFilePicker: React.FC<DriveFilePickerProps> = ({ userToken, onFileSelect, onClose }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      if (!userToken) {
        setError("Authentication token is not available.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch('/api/list_drive_files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to fetch files from Google Drive.');
        }
        const fileList = await response.json();
        setFiles(fileList);
      } catch (err: any) {
        setError(err.message || 'An unknown error occurred.');
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [userToken]);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
      <div className="relative mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Select a PDF from Google Drive</h3>
          <div className="mt-2 px-7 py-3">
            {loading && <p>Loading files...</p>}
            {error && <p className="text-red-500">{error}</p>}
            <ul className="bg-white rounded-lg border border-gray-200 w-full text-gray-900">
              {files.map((file) => (
                <li key={file.id} className="px-6 py-2 border-b border-gray-200 w-full rounded-t-lg">
                  <button onClick={() => onFileSelect(file.id, file.name)} className="w-full text-left hover:bg-gray-100 p-2 rounded">
                    {file.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="items-center px-4 py-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriveFilePicker;
