import { Link } from "react-router-dom";
import Icon from "../components/Icon";

const jobs = [
  ["Senior Frontend Developer", "FPT Software", "Hà Nội", "30 – 45 triệu"],
  ["Chuyên viên Digital Marketing", "Tiki", "TP. Hồ Chí Minh", "15 – 25 triệu"],
  ["Product Designer", "VNG Corporation", "Từ xa", "20 – 32 triệu"],
];

export default function Landing() {
  return <div className="app-shell">
    <section className="hero"><div className="hero-inner"><span className="eyebrow"><Icon name="spark" /> Tuyển dụng thông minh với AI</span><h1>Đúng người.<br />Đúng việc. <span>Đúng chất.</span></h1><p className="hero-copy">Kết nối ứng viên và nhà tuyển dụng bằng một trải nghiệm tuyển dụng rõ ràng, nhanh chóng và phù hợp hơn.</p><div className="hero-actions"><Link to="/register" className="btn btn-primary">Tạo hồ sơ ngay <Icon name="arrow" /></Link><Link to="/login" className="btn btn-outline">Tôi là nhà tuyển dụng</Link></div></div></section>
    <main className="content"><div className="feature-grid">{[["brain", "Gợi ý phù hợp", "Cơ hội phù hợp với kỹ năng và mong muốn của ứng viên."], ["file", "Tìm việc nhanh", "Bộ lọc rõ ràng theo ngành, địa điểm và hình thức làm việc."], ["chart", "Dashboard trực quan", "Theo dõi hồ sơ và tiến trình tuyển dụng ở một nơi."], ["zap", "Ứng tuyển dễ dàng", "Hoàn thiện profile, đính kèm CV và sẵn sàng ứng tuyển."]].map(([icon, title, desc]) => <div className="feature" key={title}><div className="feature-icon"><Icon name={icon} /></div><h3>{title}</h3><p>{desc}</p></div>)}</div><div className="section-heading"><div><p>Cơ hội mới mỗi ngày</p><h2>Việc làm nổi bật<span>.</span></h2></div><Link to="/dashboard" className="btn btn-outline">Xem dashboard <Icon name="arrow" /></Link></div><div className="job-grid">{jobs.map(([title, company, location, salary]) => <article className="job-card" key={title}><div className="job-mark">{company.slice(0, 1)}</div><h3>{title}</h3><div className="job-company">{company}</div><div className="job-meta"><span className="tag">{location}</span><span className="tag">{salary}</span></div></article>)}</div></main>
  </div>;
}
