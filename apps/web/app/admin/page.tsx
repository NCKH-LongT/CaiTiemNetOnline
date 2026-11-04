import dynamic from 'next/dynamic';

const AdminConsole = dynamic(() => import('@/components/AdminConsole'));

export default function AdminPage() {
  return <AdminConsole />;
}
