const glyphs = { spark: "✦", arrow: "↗", brain: "✺", file: "▤", chart: "▥", zap: "ϟ", briefcase: "▣", layout: "▦", user: "◉", map: "⌖", upload: "↑", save: "✓" };

export default function Icon({ name }) {
  return <span className="icon" aria-hidden="true">{glyphs[name] || "•"}</span>;
}
