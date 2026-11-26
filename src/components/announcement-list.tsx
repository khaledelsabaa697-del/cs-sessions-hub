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
      <div className="p-5">
        <EmptyState title={emptyTitle} />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {announcements.map((announcement) => (
        <li key={announcement.id} className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {hrefBase ? (
                  <Link
                    href={`${hrefBase}/${announcement.id}`}
                    className="transition hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    {announcement.title}
                  </Link>
                ) : (
                  announcement.title
                )}
              </h3>
              {announcement.pinned ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  {pinnedLabel}
                </span>
              ) : null}
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {formatDate(announcement.created_at, locale)}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {announcement.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
