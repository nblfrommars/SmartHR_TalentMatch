// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import JobCard from "./JobCard";

const locations = [
  { id: "hn", name: "Hà Nội", parentId: null },
  { id: "cg", name: "Cầu Giấy", parentId: "hn" },
];

const job = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Senior Java Backend Developer",
  companyName: "Acme Corp",
  salaryMin: 30_000_000,
  salaryMax: 50_000_000,
  level: "SENIOR",
  workMode: "HYBRID",
  location: { id: "cg", name: "Cầu Giấy", parentId: "hn" },
  deadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  skills: [{ skill: "Java" }, { skill: "Kafka" }],
};

describe("JobCard", () => {
  it("hiển thị thông tin chính và liên kết tới trang chi tiết", () => {
    render(
      <MemoryRouter>
        <JobCard job={job} locations={locations} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Senior Java Backend Developer")).toBeTruthy();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("30 – 50 triệu")).toBeTruthy();
    expect(screen.getByText("Cầu Giấy, Hà Nội")).toBeTruthy();
    expect(screen.getByText("Senior")).toBeTruthy();
    expect(screen.getByText("Java")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(`/jobs/${job.id}`);
  });
});
