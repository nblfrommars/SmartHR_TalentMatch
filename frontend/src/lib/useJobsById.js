import { useEffect, useState } from "react";
import { jobApi } from "./jobApi";

/**
 * Đơn ứng tuyển chỉ lưu jobId, nên lấy thêm thông tin job từ job-service (API công khai).
 * Kết quả: { [jobId]: job | null } — null nghĩa là tin đã đóng/không còn (job-service trả 404).
 */
export function useJobsById(jobIds) {
  const [jobs, setJobs] = useState({});
  const key = [...new Set(jobIds)].sort().join(",");

  useEffect(() => {
    let active = true;
    const ids = key ? key.split(",") : [];
    Promise.allSettled(ids.map((id) => jobApi.get(id))).then((results) => {
      if (!active) return;
      const map = {};
      results.forEach((result, index) => {
        map[ids[index]] = result.status === "fulfilled" ? result.value : null;
      });
      setJobs(map);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return jobs;
}
