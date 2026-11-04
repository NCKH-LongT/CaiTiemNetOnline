import dynamic from 'next/dynamic';

const NetverseApp = dynamic(() => import('@/components/NetverseApp'));

export default function Page() {
  return <NetverseApp />;
}
