import { useState } from "react";
import { toTree } from "../lib/format";

export default function SearchBar({ initial = {}, locations = [], onSubmit, large = false }) {
  const [keyword, setKeyword] = useState(initial.keyword || "");
  const [locationId, setLocationId] = useState(initial.locationId || "");
  const provinces = toTree(locations);
  const height = large ? "h-14 text-base" : "h-11 text-sm";

  function submit(event) {
    event.preventDefault();
    onSubmit({ keyword: keyword.trim(), locationId });
  }

  return (
    <form
      onSubmit={submit}
      className={`flex w-full flex-col gap-2 rounded-2xl bg-white p-2 shadow-card-hover sm:flex-row ${large ? "sm:p-3" : ""}`}
      role="search"
    >
      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="Tìm việc làm, kỹ năng, công ty..."
        aria-label="Từ khóa"
        className={`min-w-0 flex-1 rounded-xl px-4 text-zinc-900 outline-none placeholder:text-zinc-400 focus:bg-zinc-50 ${height}`}
      />
      <select
        value={locationId}
        onChange={(event) => setLocationId(event.target.value)}
        aria-label="Địa điểm"
        className={`rounded-xl border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-brand-500 sm:w-52 ${height}`}
      >
        <option value="">Tất cả địa điểm</option>
        {provinces.map((province) => (
          <option key={province.id} value={province.id}>
            {province.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className={`rounded-xl bg-accent-500 px-8 font-semibold text-white transition hover:bg-accent-600 ${height}`}
      >
        Tìm kiếm
      </button>
    </form>
  );
}
