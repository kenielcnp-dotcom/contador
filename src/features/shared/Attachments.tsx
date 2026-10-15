import { FileText, Image, Paperclip, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from '@/app/config';
import type { AttachmentEntity } from '@/data/models';
import { api, useAppMutation, useAttachments, useGroup } from '@/data/queries';
import { useConfirm } from '@/ui/Confirm';
import { useToast } from '@/ui/Toast';
import { ErrorState, Spinner } from '@/ui/States';

export function validateAttachment(file: File): string | null {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return 'Tipo de arquivo não permitido. Use JPG, PNG, WEBP ou PDF.';
  if (file.size > ATTACHMENT_MAX_BYTES) return 'Arquivo grande demais (máximo 5 MB).';
  if (file.size === 0) return 'O arquivo está vazio.';
  return null;
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Comprovantes de um registro: bucket privado, abertos por URL assinada de 5 minutos. */
export function Attachments({ entityType, entityId, readOnly }: { entityType: AttachmentEntity; entityId: string; readOnly?: boolean }) {
  const { group } = useGroup();
  const list = useAttachments(entityType, entityId);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const upload = useAppMutation((file: File) => api.uploadAttachment(group.id, entityType, entityId, file), { success: 'Comprovante anexado.' });
  const remove = useAppMutation((id: string) => api.removeAttachment(id), { success: 'Comprovante removido.' });

  async function open(path: string) {
    // Abre a aba já no clique (bloqueador de pop-up) e só depois aponta para a URL assinada.
    const tab = window.open('', '_blank');
    try {
      const url = await api.signedUrl('comprovantes', path, 300);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3>Comprovantes</h3>
        {!readOnly && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? <Spinner label="Enviando" /> : <Paperclip size={14} aria-hidden />} Anexar
            </button>
            <input
              ref={input}
              type="file"
              accept={ATTACHMENT_TYPES.join(',')}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const problem = validateAttachment(file);
                if (problem) toast.error(problem);
                else upload.mutate(file);
              }}
            />
          </>
        )}
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="small muted">Nenhum comprovante.</p>
      ) : (
        <ul className="list">
          {list.data.map((a) => (
            <li key={a.id} className="list-item">
              <span className="list-icon">{a.mimeType === 'application/pdf' ? <FileText size={18} aria-hidden /> : <Image size={18} aria-hidden />}</span>
              <button type="button" className="list-main" onClick={() => void open(a.storagePath)} style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                <span className="list-title" style={{ display: 'block', color: 'var(--green-700)' }}>
                  {a.fileName}
                </span>
                <span className="list-sub">{size(a.sizeBytes)}</span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remover ${a.fileName}`}
                  onClick={async () => {
                    if (await confirm({ title: 'Remover comprovante?', message: a.fileName, confirmLabel: 'Remover', danger: true })) remove.mutate(a.id);
                  }}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
