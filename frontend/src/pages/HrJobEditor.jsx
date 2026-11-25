import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import JobForm from "../components/JobForm";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import { isNotFound, jobApi } from "../lib/jobApi";
import { jobToForm } from "../lib/jobFormModel";
import { useToast } from "../lib/toastContext";
import { useReferenceData } from "../lib/useReferenceData";

/** /hr/jobs/new (tạo) và /hr/jobs/:id/edit (sửa). */
export default function HrJobEditor() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { getToken, user } = useAuth();
  const reference = useReferenceData();
  const [state, setState] = useState({ loading: editing, error: null, job: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    jobApi
      .get(id, getToken)
      .then((job) => active && setState({ loading: false, error: null, job }))
      .catch((error) => active && setState({ loading: false, error, job: null }));
    return () => {
      active = false;
    };
  }, [editing, id, getToken, attempt]);

  async function submit(body) {
    try {
      if (editing) {
        await jobApi.update(id, body, getToken);
        toast.success("Đã cập nhật tin tuyển dụng.");
        navigate(`/jobs/${id}`);
      } else {
        const created = await jobApi.create(body, getToken);
        toast.success("Đăng tin thành công!");
        navigate(`/jobs/${created.id}`);
      }
    } catch (error) {
      toast.error(error);
      throw error; // để JobForm hiện lỗi theo trường
    }
  }

  const title = editing ? "Sửa tin tuyển dụng" : "Đăng tin tuyển dụng mới";
  const back = (
    <Link to="/hr/jobs" className="text-sm font-semibold text-brand-600 hover:underline">
      ‹ Danh sách tin
    </Link>
  );

  let content;
  if (state.loading || reference.loading) {
    content = <Loading />;
  } else if (reference.error) {
    content = <ErrorBox message="Không tải được danh mục ngành nghề / địa điểm." onRetry={() => window.location.reload()} />;
  } else if (state.error && isNotFound(state.error)) {
    content = <Empty title="Không tìm thấy tin tuyển dụng" />;
  } else if (state.error) {
    content = <ErrorBox message="Không tải được tin tuyển dụng." onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (editing && state.job.createdBy !== user?.id) {
    content = <Empty title="Đây không phải tin tuyển dụng của bạn" hint="Chỉ người đăng tin mới sửa được." />;
  } else if (editing && state.job.status === "CLOSED") {
    content = <Empty title="Tin đã đóng" hint="Tin tuyển dụng đã đóng không sửa được nữa." />;
  } else {
    content = (
      <JobForm
        key={state.job?.id || "new"}
        initial={jobToForm(state.job)}
        industries={reference.industries}
        locations={reference.locations}
        submitLabel={editing ? "Lưu thay đổi" : "Đăng tin"}
        onSubmit={submit}
        onCancel={() => navigate(-1)}
      />
    );
  }

  return (
    <AccountLayout title={title} actions={back}>
      {content}
    </AccountLayout>
  );
}
