import dynamic from 'next/dynamic';

const NetverseApp = dynamic(() => import('@/components/NetverseWorldApp'));

export default function Page() {
  return <NetverseApp />;
}
