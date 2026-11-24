import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import JobCard from "../components/JobCard";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import PublicLayout from "../components/PublicLayout";
import SearchBar from "../components/SearchBar";
import { toTree } from "../lib/format";
import { jobApi } from "../lib/jobApi";
import { useReferenceData } from "../lib/useReferenceData";

export default function Home() {
  const navigate = useNavigate();
  const { industries, locations } = useReferenceData();
  const [latest, setLatest] = useState({ loading: true, error: null, jobs: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    jobApi
      .search({ size: 12, sort: "createdAt,desc" })
      .then((page) => active && setLatest({ loading: false, error: null, jobs: page.content }))
      .catch((error) => active && setLatest({ loading: false, error, jobs: [] }));
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLatest({ loading: true, error: null, jobs: [] });
    setAttempt((n) => n + 1);
  }, []);

  function search({ keyword, locationId }) {
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (locationId) params.set("locationId", locationId);
    navigate(`/jobs${params.size ? `?${params}` : ""}`);
  }

  const sectors = toTree(industries);

  return (
    <PublicLayout>
      <section className="bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">
            Tìm công việc phù hợp, bước tiếp trên con đường sự nghiệp
          </h1>
          <p className="mt-4 max-w-xl text-brand-100">
            Khám phá các cơ hội mới nhất theo ngành nghề, địa điểm và mức lương mong muốn.
          </p>
          <div className="mt-8">
            <SearchBar large locations={locations} onSubmit={search} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {sectors.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-zinc-900">Ngành nghề trọng điểm</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {sectors.map((sector) => (
                <Link
                  key={sector.id}
                  to={`/jobs?industryId=${sector.id}`}
                  className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-lg font-bold text-brand-600">
                    {sector.name.charAt(0)}
                  </span>
                  <span className="text-sm font-semibold text-zinc-800">{sector.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold text-zinc-900">Việc làm mới nhất</h2>
            <Link to="/jobs" className="text-sm font-semibold text-brand-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          <div className="mt-4">
            {latest.loading && <Loading />}
            {latest.error && <ErrorBox message="Không tải được danh sách việc làm." onRetry={retry} />}
            {!latest.loading && !latest.error && latest.jobs.length === 0 && (
              <Empty title="Chưa có tin tuyển dụng nào" hint="Hãy quay lại sau nhé." />
            )}
            {latest.jobs.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latest.jobs.map((job) => (
                  <JobCard key={job.id} job={job} locations={locations} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
