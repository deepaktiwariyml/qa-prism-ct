import { TestCaseGenerator } from '@/components/TestCaseGenerator';

export const dynamic = 'force-dynamic';

export default function TestCasesPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <TestCaseGenerator />
    </div>
  );
}
