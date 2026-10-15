import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** false enquanto salva: impede fechar no meio de uma operação. */
  dismissable?: boolean;
  wide?: boolean;
}

/**
 * Modal acessível sobre <dialog>: foco preso, Esc fecha, fundo inerte.
 * No celular vira "bottom sheet" que nunca passa da altura da tela.
 */
export function Sheet({ open, onClose, title, children, footer, dismissable = true, wide }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissable);
  dismissRef.current = dismissable;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      if (!open) return;
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (dismissRef.current) closeRef.current();
    };
    const onClick = (e: MouseEvent) => {
      // Clique no fundo (fora da caixa) fecha.
      if (e.target === dialog && dismissRef.current) closeRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('click', onClick);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('click', onClick);
      document.documentElement.style.overflow = '';
    };
  }, []);

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} style={wide ? { width: 'min(720px, calc(100vw - 32px))' } : undefined}>
      {open && (
        <>
          <div className="sheet-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar" disabled={!dismissable}>
              <X size={20} aria-hidden />
            </button>
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
