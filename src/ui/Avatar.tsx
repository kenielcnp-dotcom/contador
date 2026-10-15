import { useQuery } from '@tanstack/react-query';
import { api } from '@/data/queries';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '')).toUpperCase();
}

/** Foto de perfil vem do bucket privado por URL assinada de curta duração. */
export function Avatar({
  name,
  path,
  partner,
  size,
}: {
  name: string;
  path?: string | null;
  partner?: boolean;
  size?: 'lg';
}) {
  const { data: url } = useQuery({
    queryKey: ['avatar-url', path],
    queryFn: () => api.signedUrl('avatars', path!, 3600),
    enabled: !!path,
    staleTime: 50 * 60_000,
    retry: false,
  });
  return (
    <span className={`avatar ${partner ? 'partner' : ''} ${size === 'lg' ? 'avatar-lg' : ''}`} aria-hidden>
      {url ? <img src={url} alt="" /> : initials(name)}
    </span>
  );
}
