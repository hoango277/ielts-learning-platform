import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import type { User } from '../lib/types';

/** Người dùng đang đăng nhập (null nếu chưa). */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.me()).user,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Khi bất kỳ API nào trả 401 (phiên hết hạn) → coi như đã đăng xuất. */
export function useUnauthorizedListener() {
  const qc = useQueryClient();
  useEffect(() => {
    const onUnauthorized = () => {
      if (qc.getQueryData(['me'])) qc.setQueryData(['me'], null);
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [qc]);
}

/** Đổi người dùng → xoá sạch dữ liệu đã cache của người trước. */
export function useSetSignedIn() {
  const qc = useQueryClient();
  return (user: User | null) => {
    qc.clear();
    qc.setQueryData(['me'], user);
  };
}

export function useLogout() {
  const setSignedIn = useSetSignedIn();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      setSignedIn(null);
      navigate('/login', { replace: true });
    },
  });
}
