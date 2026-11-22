import React, { useEffect, useState } from 'react';
import { ToastContainer } from './components/common/ToastContainer';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { LibraryView } from './components/library/LibraryView';
import { PdfExportModal } from './components/management/PdfExportModal';
import { PrintReportView } from './components/management/PrintReportView';
import { ShelvesDataView } from './components/management/ShelvesDataView';
import { ProfileGate } from './components/profiles/ProfileGate';
import { SearchView } from './components/search/SearchView';
import { TimelineView } from './components/timeline/TimelineView';
import { LibraryProvider, useLibrary } from './store/LibraryContext';
import type { AppTab } from './types/library';
import type { PdfReportOptions } from './utils/pdfReport';

const AppShell: React.FC = () => {
  const { activeProfile } = useLibrary();
  const [activeTab, setActiveTab] = useState<AppTab>('library');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState<PdfReportOptions | null>(null);

  useEffect(() => {
    if (!printOptions) return;
    let cancelled = false;

    const cleanup = () => {
      if (!cancelled) {
        setPrintOptions(null);
      }
    };

    window.addEventListener('afterprint', cleanup, { once: true });

    const runPrint = async () => {
      await new Promise((r) => window.setTimeout(r, 120));
      if (cancelled) return;

      const root = document.getElementById('print-report-root');
      if (root) {
        const imgs = Array.from(root.querySelectorAll('img')).filter((img) => !img.complete);
        if (imgs.length > 0) {
          await Promise.race([
            Promise.all(
              imgs.map(
                (img) =>
                  new Promise<void>((resolve) => {
                    img.addEventListener('load', () => resolve(), { once: true });
                    img.addEventListener('error', () => resolve(), { once: true });
                  }),
              ),
            ),
            new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
          ]);
        }
      }

      if (!cancelled) {
        window.print();
      }
    };

    void runPrint();

    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', cleanup);
    };
  }, [printOptions]);

  const handleTriggerPrint = (options: PdfReportOptions) => {
    setPdfModalOpen(false);
    setPrintOptions(options);
  };

  if (!activeProfile) {
    return (
      <>
        <ProfileGate />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <div
        className={`min-h-screen flex flex-col bg-[#FAF8F5] dark:bg-[#0F1117] text-stone-900 dark:text-stone-100 ${
          printOptions ? 'print:hidden' : ''
        }`}
      >
        <Header activeTab={activeTab} onSelectTab={setActiveTab} />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12">
          {activeTab === 'library' && (
            <LibraryView
              onNavigateTab={setActiveTab}
              onOpenPdfExport={() => setPdfModalOpen(true)}
            />
          )}
          {activeTab === 'search' && <SearchView />}
          {activeTab === 'timeline' && (
            <TimelineView onOpenPdfExport={() => setPdfModalOpen(true)} />
          )}
          {activeTab === 'management' && (
            <ShelvesDataView onOpenPdfExport={() => setPdfModalOpen(true)} />
          )}
        </main>

        <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />
        <ToastContainer />
      </div>

      <PdfExportModal
        open={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        onTriggerPrint={handleTriggerPrint}
      />

      {printOptions && <PrintReportView options={printOptions} />}
    </>
  );
};

export function App() {
  return (
    <LibraryProvider>
      <AppShell />
    </LibraryProvider>
  );
}

export default App;
