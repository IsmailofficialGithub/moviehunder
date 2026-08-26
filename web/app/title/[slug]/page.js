import Link from "next/link";
import DetailClient from "../../../components/DetailClient";
import EmptyState from "../../../components/EmptyState";
import { getDetail, getEpisodes } from "../../../lib/api";
import styles from "./title.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  try {
    const detail = await getDetail(decoded);
    const name =
      detail?.title || detail?.name || detail?.subject_title || decoded;
    return { title: name };
  } catch {
    return { title: decoded };
  }
}

export default async function TitlePage({ params }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);

  try {
    const [detail, episodes] = await Promise.all([
      getDetail(slug),
      getEpisodes(slug).catch(() => null),
    ]);
    return (
      <main className={`page ${styles.wrap}`}>
        <Link className={styles.back} href="/">
          ← Back
        </Link>
        <DetailClient slug={slug} detail={detail} episodes={episodes} />
      </main>
    );
  } catch {
    return (
      <main className="page">
        <EmptyState
          title="No items found"
          hint="This title isn’t available."
          actionLabel="Back to Home"
        />
      </main>
    );
  }
}
