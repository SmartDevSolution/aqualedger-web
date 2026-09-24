import {Workspace} from '@/components/workspace';

type SavedAnalysisPageProps = {
  params: Promise<{id: string}>;
};

export default async function SavedAnalysisPage({params}: SavedAnalysisPageProps) {
  const {id} = await params;
  return <Workspace analysisId={id} />;
}
