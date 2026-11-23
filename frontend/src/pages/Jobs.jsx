import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FilterPanel from "../components/FilterPanel";
import JobCard from "../components/JobCard";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import Pagination from "../components/Pagination";
import PublicLayout from "../components/PublicLayout";
import SearchBar from "../components/SearchBar";
import { jobApi } from "../lib/jobApi";
import { useReferenceData } from "../lib/useReferenceData";

const PAGE_SIZE = 12;
const FILTER_KEYS = ["keyword", "industryId", "locationId", "level", "salaryMin", "companyName"];
const SORTS = [
  { value: "createdAt,desc", label: "Mới nhất" },
  { value: "deadline,asc", label: "Sắp hết hạn" },
  { value: "salaryMax,desc", label: "Lương cao nhất" },
];

export default function Jobs() {
  const [params, setParams] = useSearchParams();
  const { industries, locations } = useReferenceData();
  const [result, setResult] = useState({ loading: true, error: null, page: null });
  const [attempt, setAttempt] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const values = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || ""]));
  const page = Math.max(0, (parseInt(params.get("page") || "1", 10) || 1) - 1); // URL tính từ 1
  const sort = params.get("sort") || SORTS[0].value;
  const queryKey = params.toString();

  useEffect(() => {
    let active = true;
    jobApi
      .search({ ...values, page, size: PAGE_SIZE, sort })
      .then((data) => active && setResult({ loading: false, error: null, page: data }))
      .catch((error) => active && setResult({ loading: false, error, page: null }));
    return () => {
      active = false;
    };
    // values/page/sort đều suy ra từ queryKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, attempt]);

  const update = useCallback(
    (changes, { keepPage = false } = {}) => {
      const next = new URLSearchParams(params);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined) next.delete(key);
        else next.set(key, value);
      });
      if (!keepPage) next.delete("page");
      setParams(next);
      setResult((current) => ({ ...current, loading: true }));
    },
    [params, setParams],
  );

  function retry() {
    setResult({ loading: true, error: null, page: null });
    setAttempt((n) => n + 1);
  }

  const jobs = result.page?.content || [];
  const filterKey = FILTER_KEYS.map((key) => values[key]).join("|");

  return (
    <PublicLayout>
      <div className="border-b border-zinc-200 bg-brand-900">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <SearchBar
            key={`${values.keyword}|${values.locationId}`}
            initial={values}
            locations={locations}
            onSubmit={({ keyword, locationId }) => update({ keyword, locationId })}
          />
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[18rem_1fr]">
        <aside>
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 lg:hidden"
          >
            {showFilters ? "Ẩn bộ lọc" : "Hiện bộ lọc"}
          </button>
          <div className={`${showFilters ? "block" : "hidden"} lg:block`}>
            <FilterPanel
              key={filterKey}
              values={values}
              industries={industries}
              locations={locations}
              onChange={(changes) => update(changes)}
              onReset={() => setParams(new URLSearchParams())}
            />
          </div>
        </aside>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-600">
              {result.page ? (
                <>
                  Tìm thấy <strong className="text-zinc-900">{result.page.totalElements}</strong> việc làm
                </>
              ) : (
                "Đang tìm kiếm..."
              )}
            </p>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              Sắp xếp
              <select
                value={sort}
                onChange={(event) => update({ sort: event.target.value === SORTS[0].value ? "" : event.target.value })}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-brand-500"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {result.loading && <Loading />}
          {!result.loading && result.error && (
            <ErrorBox message="Không tải được danh sách việc làm." onRetry={retry} />
          )}
          {!result.loading && !result.error && jobs.length === 0 && (
            <Empty title="Không tìm thấy việc làm phù hợp" hint="Thử bỏ bớt bộ lọc hoặc đổi từ khóa." />
          )}
          {!result.loading && jobs.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} locations={locations} />
                ))}
              </div>
              <Pagination
                page={result.page.number}
                totalPages={result.page.totalPages}
                onChange={(next) => {
                  update({ page: next === 0 ? "" : String(next + 1) }, { keepPage: true });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
