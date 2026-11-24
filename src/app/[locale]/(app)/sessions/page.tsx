import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

type SessionRow = {
  id: string;
  title: string;
  session_date: string;
};

type MaterialRow = {
  id: string;
  session_id: string;
  type: string;
  title: string;
  content: string | null;
  file_path: string | null;
  mime_type: string | null;
  language: string | null;
};

export default async function StudentSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  if (profile.role === "admin") redirect(`/${locale}/admin/sessions`);

  const t = await getTranslations("sessions");
  const supabase = await createClient();

  const [sessionsResult, materialsResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, session_date")
      .order("session_date", { ascending: false })
      .limit(100)
      .returns<SessionRow[]>(),
    supabase
      .from("session_materials")
      .select("id, session_id, type, title, content, file_path, mime_type, language")
      .order("created_at", { ascending: true })
      .returns<MaterialRow[]>(),
  ]);

  const sessions = sessionsResult.data ?? [];
  const materials = materialsResult.data ?? [];

  // Generate signed URLs for file-based materials.
  const signedUrls = new Map<string, string>();
  for (const m of materials) {
    if (m.file_path) {
      const { data } = await supabase.storage
        .from("session-materials")
        .createSignedUrl(m.file_path, 3600);
      if (data?.signedUrl) signedUrls.set(m.id, data.signedUrl);
    }
  }

  const materialsBySession = new Map<string, MaterialRow[]>();
  for (const m of materials) {
    const list = materialsBySession.get(m.session_id) ?? [];
    list.push(m);
    materialsBySession.set(m.session_id, list);
  }

  const hasError = Boolean(sessionsResult.error || materialsResult.error);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {hasError ? <Alert>{t("noSessions")}</Alert> : null}

      {sessions.length === 0 ? (
        <EmptyState title={t("noSessions")} />
      ) : (
        <div className="space-y-6">
          {sessions.map((session) => {
            const mats = materialsBySession.get(session.id) ?? [];
            return (
              <Card key={session.id}>
                <CardHeader
                  title={session.title}
                  description={formatDate(session.session_date, locale, {
                    dateStyle: "medium",
                  })}
                />
                <div className="space-y-4 p-5">
                  {mats.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t("noMaterials")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {mats.map((m) => {
                        const url = signedUrls.get(m.id);
                        return (
                          <li
                            key={m.id}
                            className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                          >
                            <p className="font-medium text-slate-900 dark:text-white">
                              {m.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {m.type}
                              {m.language ? ` · ${m.language}` : ""}
                            </p>

                            {m.type === "text" && m.content ? (
                              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                                {m.content}
                              </p>
                            ) : null}

                            {m.type === "code" && m.content ? (
                              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                                <code>{m.content}</code>
                              </pre>
                            ) : null}

                            {m.type === "image" && url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={url}
                                alt={m.title}
                                className="mt-3 max-h-96 rounded-lg"
                              />
                            ) : null}

                            {m.type === "video" && url ? (
                              <video
                                src={url}
                                controls
                                className="mt-3 max-h-96 w-full rounded-lg"
                              />
                            ) : null}

                            {(m.type === "file" || m.type === "notebook") && url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
                              >
                                {m.title}
                              </a>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
