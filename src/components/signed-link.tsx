import { signFileUrl } from "@/lib/crypto";
import type { Session } from "@/lib/auth";

/** Enlace temporal (5 min) y ligado al usuario. Se genera al renderizar en servidor: nunca hay URL pública del archivo. */
export function SignedLink({ session, attachmentId, children, className = "text-brand-600 underline" }: { session: Session; attachmentId: string | null; children: React.ReactNode; className?: string }) {
  if (!attachmentId) return <span className="text-gray-400">{children}</span>;
  return <a className={className} href={signFileUrl(attachmentId, session.userId)} target="_blank" rel="noopener noreferrer">{children}</a>;
}
