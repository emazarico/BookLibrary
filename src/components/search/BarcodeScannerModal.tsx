import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CameraOff, ScanBarcode } from 'lucide-react';
import { Modal } from '../common/Modal';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (isbn: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onDetected,
}) => {
  const rawId = useId().replace(/:/g, '');
  const scannerRegionId = `isbn-scanner-${rawId}`;
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualIsbn, setManualIsbn] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledScanRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handledScanRef.current = false;
    setCameraError(null);
    setManualIsbn('');

    const startScanner = async () => {
      try {
        const instance = new Html5Qrcode(scannerRegionId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
          ],
          verbose: false,
        });
        scannerRef.current = instance;

        await instance.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 130 },
          },
          (decodedText) => {
            if (cancelled || handledScanRef.current) return;
            const cleaned = decodedText.replace(/[^0-9Xx]/g, '');
            if (cleaned.length >= 10) {
              handledScanRef.current = true;
              void (async () => {
                try {
                  if (instance.isScanning) await instance.stop();
                  instance.clear();
                } catch {
                  // ignore cleanup errors
                }
                onDetected(cleaned);
                onClose();
              })();
            }
          },
          () => {
            // Frame scan miss — ignore silently
          },
        );

        if (cancelled) {
          try {
            if (instance.isScanning) await instance.stop();
            instance.clear();
          } catch {
            // ignore
          }
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Camera access unavailable. You can type an ISBN below instead.';
        setCameraError(message);
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const instance = scannerRef.current;
      scannerRef.current = null;
      if (instance) {
        void (async () => {
          try {
            if (instance.isScanning) await instance.stop();
            instance.clear();
          } catch {
            // ignore teardown errors
          }
        })();
      }
    };
  }, [open, onClose, onDetected, scannerRegionId]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualIsbn.replace(/[^0-9Xx]/g, '');
    if (!cleaned) return;
    onDetected(cleaned);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan Book ISBN Barcode"
      subtitle="Point your rear camera at the EAN/ISBN barcode on the back cover."
      maxWidthClass="max-w-md"
    >
      <div className="p-5 space-y-4">
        <div className="relative rounded-2xl overflow-hidden bg-stone-950 min-h-[250px] flex items-center justify-center">
          <div id={scannerRegionId} className="w-full" />

          {cameraError && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-stone-900/95 text-stone-200">
              <CameraOff className="w-8 h-8 text-amber-400 mb-2" />
              <p className="text-sm font-semibold">Camera unavailable</p>
              <p className="text-xs text-stone-400 mt-1 max-w-xs">{cameraError}</p>
            </div>
          )}
        </div>

        <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={manualIsbn}
              onChange={(e) => setManualIsbn(e.target.value)}
              placeholder="Or type ISBN (e.g. 9780593135204)"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold cursor-pointer"
          >
            Lookup
          </button>
        </form>
      </div>
    </Modal>
  );
};
