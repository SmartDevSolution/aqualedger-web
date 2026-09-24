import {getTranslations} from 'next-intl/server';

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  return (
    <main className="page-content">
      <header className="page-heading">
        <p className="eyebrow">AquaLedger</p>
        <h1>{t('title')}</h1>
        <p className="page-intro">{t('description')}</p>
      </header>

      <section className="panel source-panel" aria-labelledby="source-status-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('statusHeading')}</p>
            <h2 id="source-status-heading">{t('statusHeading')}</h2>
          </div>
          <span className="status-tag status-tag-neutral">{t('statusUnavailable')}</span>
        </div>
        <p className="notice notice-neutral" role="status">{t('statusUnavailableDetail')}</p>
        <h3>{t('sourceFieldsHeading')}</h3>
        <ul className="plain-list">
          <li>{t('configured')}</li>
          <li>{t('checkState')}</li>
          <li>{t('checkScope')}</li>
          <li>{t('reason')}</li>
        </ul>
        <p className="subtle-copy">{t('settingsDisclosure')}</p>
      </section>
    </main>
  );
}
