import { LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/primitives';

export default function NotFound() {
  return (
    <EmptyState
      icon="🧭"
      title="Không tìm thấy trang"
      description="Đường dẫn không tồn tại hoặc đã được di chuyển."
      action={
        <LinkButton to="/" variant="primary">Về trang chủ</LinkButton>
      }
    />
  );
}
