import { describe, expect, it } from "vitest";
import { buildLabel, daysLeft, deadlineLabel, formatSalary, toTree } from "./format";

describe("formatSalary", () => {
  it("hiển thị khoảng lương theo triệu", () => {
    expect(formatSalary(30_000_000, 50_000_000)).toBe("30 – 50 triệu");
  });

  it("giữ một chữ số thập phân khi cần", () => {
    expect(formatSalary(12_500_000, 20_000_000)).toBe("12.5 – 20 triệu");
  });

  it("xử lý thiếu một đầu hoặc cả hai", () => {
    expect(formatSalary(30_000_000, null)).toBe("Từ 30 triệu");
    expect(formatSalary(null, 50_000_000)).toBe("Đến 50 triệu");
    expect(formatSalary(null, null)).toBe("Thương lượng");
  });

  it("gộp khi min bằng max", () => {
    expect(formatSalary(20_000_000, 20_000_000)).toBe("20 triệu");
  });
});

describe("deadline", () => {
  const now = Date.parse("2026-11-24T00:00:00Z");

  it("đếm số ngày còn lại (làm tròn lên)", () => {
    expect(daysLeft("2026-11-27T00:00:00Z", now)).toBe(3);
    expect(daysLeft("2026-11-24T12:00:00Z", now)).toBe(1);
  });

  it("đặt nhãn theo số ngày", () => {
    expect(deadlineLabel("2026-11-27T00:00:00Z", now)).toBe("Còn 3 ngày");
    expect(deadlineLabel("2026-11-24T00:00:00Z", now)).toBe("Hết hạn hôm nay");
    expect(deadlineLabel("2026-11-20T00:00:00Z", now)).toBe("Đã hết hạn");
    expect(deadlineLabel("không hợp lệ", now)).toBe("");
  });
});

describe("danh mục cha-con", () => {
  const list = [
    { id: "hn", name: "Hà Nội", parentId: null },
    { id: "cg", name: "Cầu Giấy", parentId: "hn" },
    { id: "bd", name: "Ba Đình", parentId: "hn" },
    { id: "dn", name: "Đà Nẵng", parentId: null },
  ];

  it("ghép tên con với tên cha", () => {
    expect(buildLabel(list[1], list)).toBe("Cầu Giấy, Hà Nội");
    expect(buildLabel(list[0], list)).toBe("Hà Nội");
    expect(buildLabel(null, list)).toBe("");
  });

  it("dựng cây hai cấp và sắp theo tên", () => {
    const tree = toTree(list);
    expect(tree.map((node) => node.name)).toEqual(["Đà Nẵng", "Hà Nội"]);
    expect(tree[1].children.map((node) => node.name)).toEqual(["Ba Đình", "Cầu Giấy"]);
  });
});
