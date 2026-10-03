import {getTranslations} from 'next-intl/server';
import {SourceStatusPanel} from '@/components/source-status-panel';

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const m3 = await getTranslations('settingsM3');
  return (
    <main className="page-content">
      <header className="page-heading">
        <p className="eyebrow">AquaLedger</p>
        <h1>{t('title')}</h1>
        <p className="page-intro">{t('description')}</p>
      </header>

      <SourceStatusPanel />

      <section className="panel" aria-labelledby="scoring-method-heading">
        <h2 id="scoring-method-heading">{m3('heading')}</h2>
        <p className="subtle-copy">{m3('status', {methodVersion: 'aq-scorecard-1'})}</p>
        <p className="subtle-copy">{m3('notScored')}</p>
      </section>
    </main>
  );
}
