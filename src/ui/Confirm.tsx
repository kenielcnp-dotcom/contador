import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={!!options}
        onClose={() => finish(false)}
        title={options?.title ?? ''}
        footer={
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => finish(false)}>
              {options?.cancelLabel ?? 'Voltar'}
            </button>
            <button type="button" className={`btn ${options?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => finish(true)}>
              {options?.confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        }
      >
        <div className="muted">{options?.message}</div>
      </Sheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm fora do ConfirmProvider');
  return ctx;
}
