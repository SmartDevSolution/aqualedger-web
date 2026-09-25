import {getTranslations} from 'next-intl/server';
import {SourceStatusPanel} from '@/components/source-status-panel';

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  return (
    <main className="page-content">
      <header className="page-heading">
        <p className="eyebrow">AquaLedger</p>
        <h1>{t('title')}</h1>
        <p className="page-intro">{t('description')}</p>
      </header>

      <SourceStatusPanel />
    </main>
  );
}
