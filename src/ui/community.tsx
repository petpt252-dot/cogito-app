import { useI18n } from '../i18n';

export const DISCORD_URL = 'https://discord.gg/brain';

function DiscordIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1a15.4 15.4 0 0 0-6 0L8.5 4a16.6 16.6 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7a16.7 16.7 0 0 0 5 2.5l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.6 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5-2.5c.4-4.3-.7-8-2.9-11.4ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
    </svg>
  );
}

/** Prominent community invite for the dashboard. Opens the Discord invite in a new tab (needs internet). */
export function CommunityCard() {
  const { t } = useI18n();
  return (
    <a
      href={DISCORD_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-[#5865F2]/70 bg-gradient-to-br from-[#5865F2]/25 via-panel to-panel p-6 shadow-[0_0_34px_-8px_rgba(88,101,242,.8)] transition hover:border-[#8891F7] hover:shadow-[0_0_44px_-6px_rgba(88,101,242,.95)] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent" />
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-[#5865F2]/30 blur-3xl transition group-hover:bg-[#5865F2]/45" />
      <div className="relative flex items-center gap-4">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#3A45C8] bg-gradient-to-b from-[#8891F7] to-[#4752C4] text-white shadow-[0_0_20px_-4px_rgba(88,101,242,.9)]">
          <span className="pointer-events-none absolute inset-x-0.5 top-0.5 h-1/2 rounded-t-lg bg-gradient-to-b from-white/50 to-white/0" />
          <DiscordIcon className="h-7 w-7" />
        </span>
        <span>
          <span className="block text-lg font-semibold text-white">{t('community.title')}</span>
          <span className="block text-sm text-ink/80">{t('community.text')}</span>
          <span className="mt-1 block font-mono text-xs text-[#AEB4FA]">discord.gg/brain</span>
        </span>
      </div>
      <span className="relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full border border-[#3A45C8] bg-gradient-to-b from-[#8891F7] via-[#5865F2] to-[#3A45C8] px-6 py-3 text-sm font-semibold text-white shadow-[0_0_26px_-4px_rgba(88,101,242,.9)] transition group-hover:brightness-110">
        <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-full bg-gradient-to-b from-white/60 to-white/0" />
        <DiscordIcon /> {t('community.cta')} →
      </span>
    </a>
  );
}

/** Compact sidebar link. */
export function CommunityLink() {
  const { t } = useI18n();
  return (
    <a
      href={DISCORD_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-1 mb-3 flex items-center gap-2.5 rounded-lg border border-[#5865F2]/70 bg-[#5865F2]/15 px-3 py-2 text-sm font-medium text-white shadow-[0_0_18px_-6px_rgba(88,101,242,.9)] transition hover:bg-[#5865F2]/30"
    >
      <DiscordIcon className="h-4 w-4 text-[#AEB4FA]" />
      {t('community.nav')}
      <span className="ml-auto font-mono text-[10px] text-[#AEB4FA]">discord.gg/brain</span>
    </a>
  );
}
