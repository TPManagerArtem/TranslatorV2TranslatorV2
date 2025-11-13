// This file was empty and has been implemented to display processing results.
import React, { useState } from 'react';
import { PageData, StructuredElement, TableElement, HeadingElement, ParagraphElement } from '../types';

interface ResultsViewProps {
  pages: PageData[];
}

const renderElement = (element: any, index: number) => {
  switch (element.type) {
    case 'heading':
      const heading = element as HeadingElement;
      const level = heading.level || 1;
      const alignClass = `text-${heading.align || 'left'}`;
      const classMap: { [key: number]: string } = {
          1: 'text-3xl font-bold my-4 text-slate-800',
          2: 'text-2xl font-bold my-3 text-slate-800',
          3: 'text-xl font-bold my-3 text-slate-800',
          4: 'text-lg font-bold my-2 text-slate-700',
          5: 'text-base font-bold my-2 text-slate-700',
          6: 'text-sm font-bold my-2 text-slate-700',
      };
      return React.createElement(`h${level}`, { key: index, className: `${classMap[level]} ${alignClass}` }, heading.content);
    case 'paragraph':
      return <p key={index} className="my-3 text-gray-700 leading-relaxed">{(element as ParagraphElement).content}</p>;
    case 'table':
      // CORRECTED: Now handles table as a single Markdown string
      const table = element as TableElement;
      return (
        <div key={index} className="overflow-x-auto my-4 bg-gray-50 p-3 rounded-md border">
          <pre className="text-sm font-mono whitespace-pre-wrap">{table.content}</pre>
        </div>
      );
    default:
      return null;
  }
};

const ResultsView: React.FC<ResultsViewProps> = ({ pages }) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  if (!pages || pages.length === 0) {
    return null;
  }
  
  const currentPage = pages[currentPageIndex];

  const goToNextPage = () => {
    setCurrentPageIndex((prev) => Math.min(prev + 1, pages.length - 1));
  };

  const goToPrevPage = () => {
    setCurrentPageIndex((prev) => Math.max(prev - 1, 0));
  };


  return (
    <div className="mt-8">
       <div className="page-container bg-white rounded-lg shadow-xl overflow-hidden border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="page-image p-4 bg-gray-50 flex items-center justify-center border-r border-gray-200">
                <img src={currentPage.imageDataUrl} alt={`Page ${currentPage.pageNumber}`} className="w-full h-auto max-h-[80vh] object-contain rounded-md shadow-sm" />
            </div>
            <div className="page-content p-6 overflow-y-auto max-h-[85vh]">
                <h3 className="text-xl font-bold text-slate-700 border-b border-gray-300 pb-2 mb-4">
                Page {currentPage.pageNumber} - Recognized Structure
                </h3>
                {currentPage.structure && currentPage.structure.length > 0 ? (
                currentPage.structure.map(renderElement)
                ) : (
                <p className="text-gray-500 italic">No structured content could be extracted for this page.</p>
                )}
            </div>
          </div>
      </div>
      <div className="navigation-controls flex items-center justify-center gap-4 mt-6">
        <button 
          onClick={goToPrevPage} 
          disabled={currentPageIndex === 0}
          className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <span className="text-gray-700 font-medium">
          Page {currentPageIndex + 1} of {pages.length}
        </span>
        <button 
          onClick={goToNextPage} 
          disabled={currentPageIndex === pages.length - 1}
          className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default ResultsView;