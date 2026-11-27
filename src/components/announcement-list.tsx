import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export type ReadOnlyAnnouncement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

/**
 * Read-only announcements list shared by the student dashboard and HR.
 * Pass `hrefBase` (e.g. "/hr/announcements") to link each item to its detail
 * page; omit it to render plain text.
 */
export function AnnouncementList({
  announcements,
  locale,
  pinnedLabel,
  emptyTitle,
  hrefBase,
}: {
  announcements: ReadOnlyAnnouncement[];
  locale: string;
  pinnedLabel: string;
  emptyTitle: string;
  hrefBase?: string;
}) {
  if (announcements.length === 0) {
    return (
      <div className="py-4">
        <EmptyState title={emptyTitle} />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--line)]">
      {announcements.map((announcement) => (
        <li key={announcement.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                {hrefBase ? (
                  <Link
                    href={`${hrefBase}/${announcement.id}`}
                    className="transition hover:text-bronze-600 dark:hover:text-bronze-300"
                  >
                    {announcement.title}
                  </Link>
                ) : (
                  announcement.title
                )}
              </h3>
              {announcement.pinned ? (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                  {pinnedLabel}
                </span>
              ) : null}
            </div>
            <span className="font-mono text-[10px] text-[var(--ink-muted)]">
              {formatDate(announcement.created_at, locale)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-[var(--ink-muted)]">
            {announcement.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
