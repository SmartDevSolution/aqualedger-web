'use client';

import {useTranslations} from 'next-intl';
import {scenarioExportBytes, scenarioExportFileName} from '@/lib/api/scenario-export';
import type {ScenarioResponse} from '@/lib/api/scenario';
import type {ScenarioState} from '@/lib/api/use-scenario';
import {shortHash} from '@/lib/api/result-hash';
import {isolate} from '@/lib/reason-text';
import {useScenarioReasonText} from '@/lib/scenario-reason-text';

type ScenarioPanelProps = {
  analysisId: string;
  resultSha256: string;
  state: ScenarioState;
  open: boolean;
  onToggle: () => void;
};

export function ScenarioPanelSection({analysisId, resultSha256, state, open, onToggle}: ScenarioPanelProps) {
  const t = useTranslations('scenario');
  const printT = useTranslations('scenarioPrint');

  if (state.kind === 'idle') {
    return null;
  }

  const canShow = state.kind === 'ready' || state.kind === 'loading' || state.kind === 'unavailable' || state.kind === 'blocked';

  if (!canShow) {
    return null;
  }

  return (
    <section className="result-detail-section scenario-section" aria-labelledby="scenario-heading">
      <div className="section-heading-with-note">
        <h3 id="scenario-heading">{t('heading')}</h3>
        {state.kind === 'ready' ? (
          <button
            type="button"
            className="button button-tertiary no-print"
            aria-expanded={open}
            aria-controls="scenario-panel"
            onClick={onToggle}
          >
            {open ? t('close') : t('open')}
          </button>
        ) : null}
      </div>
      <p className="subtle-copy">{t('intro')}</p>
      {state.kind === 'loading' ? (
        <p className="notice notice-neutral" role="status">{t('loading')}</p>
      ) : null}
      {state.kind === 'unavailable' ? (
        <p className="notice notice-neutral" role="status">{t('unavailable')}</p>
      ) : null}
      {state.kind === 'blocked' ? (
        <p className="notice notice-warning" role="status">{t('error')}</p>
      ) : null}
      {state.kind === 'ready' && open ? (
        <ScenarioPanelBody
          analysisId={analysisId}
          resultSha256={resultSha256}
          scenario={state.scenario}
          printHeader={printT('header', {analysisId: isolate(analysisId)})}
          printFooter={printT('footer', {
            resultSha256: isolate(shortHash(resultSha256)),
            scenarioSha256: isolate(shortHash(state.scenario.scenario_identity.scenario_sha256)),
            scenarioId: isolate(shortHash(state.scenario.scenario_identity.scenario_id))
          })}
        />
      ) : null}
    </section>
  );
}

function ScenarioPanelBody({
  analysisId,
  resultSha256,
  scenario,
  printHeader,
  printFooter
}: {
  analysisId: string;
  resultSha256: string;
  scenario: ScenarioResponse;
  printHeader: string;
  printFooter: string;
}) {
  const t = useTranslations('scenario');
  const reasonText = useScenarioReasonText();

  const downloadJson = () => {
    const bytes = scenarioExportBytes(scenario);
    const blob = new Blob([bytes], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = scenarioExportFileName(analysisId);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article
      id="scenario-panel"
      className="scenario-panel"
      data-testid="scenario-panel"
      aria-labelledby="scenario-panel-title"
      data-scenario-id={scenario.scenario_identity.scenario_id}
      data-scenario-sha256={scenario.scenario_identity.scenario_sha256}
      data-result-sha256={resultSha256}
    >
      <header className="print-header" aria-hidden="true">
        <span>{printHeader}</span>
      </header>
      <footer className="print-footer" aria-hidden="true">
        <span>{printFooter}</span>
      </footer>

      <div className="section-heading-with-note card-heading">
        <h4 id="scenario-panel-title">{t('panelTitle')}</h4>
        <div className="scenario-actions no-print">
          <button type="button" className="button button-primary" onClick={() => window.print()}>{t('print')}</button>
          <button type="button" className="button button-tertiary" onClick={downloadJson}>{t('exportJson')}</button>
        </div>
      </div>

      <div className="notice notice-neutral" role="status" aria-live="polite" data-testid="scenario-withheld-banner">
        <strong>{t('withheldTitle')}</strong>
        <p>{t('cannotEstimate')}</p>
      </div>

      <p className="notice notice-neutral">{t('hypotheticalDisclosure')}</p>
      <p className="notice notice-neutral">{t('sensitivityDisclosure')}</p>
      <p className="notice notice-neutral">{t('uncertaintyDisclosure')}</p>

      <dl className="result-facts">
        <Fact label={t('analysisAssociation')} value={<bdi dir="ltr" data-testid="scenario-analysis-id">{analysisId}</bdi>} />
        <Fact label={t('resultHash')} value={<bdi dir="ltr" title={resultSha256}>{shortHash(resultSha256)}</bdi>} />
        <Fact label={t('scenarioId')} value={<bdi dir="ltr" title={scenario.scenario_identity.scenario_id} data-testid="scenario-id">{shortHash(scenario.scenario_identity.scenario_id)}</bdi>} />
        <Fact label={t('scenarioSha256')} value={<bdi dir="ltr" title={scenario.scenario_identity.scenario_sha256} data-testid="scenario-sha256">{shortHash(scenario.scenario_identity.scenario_sha256)}</bdi>} />
        <Fact label={t('scenarioKey')} value={<bdi dir="ltr">{scenario.scenario_key}</bdi>} />
        <Fact label={t('methodVersion')} value={<bdi dir="ltr">{scenario.scenario_method_version}</bdi>} />
        <Fact label={t('definitionHash')} value={<bdi dir="ltr">{shortHash(scenario.scenario_definition_sha256)}</bdi>} />
        <Fact label={t('boundary')} value={t('boundaryLabel')} />
        <Fact label={t('period')} value={t('periodLabel')} />
        <Fact label={t('unit')} value={<bdi dir="ltr">{scenario.unit}</bdi>} />
        <Fact label={t('epistemicClass')} value={t('epistemicModeled')} />
        <Fact label={t('basis')} value={t('basisIllustrative')} />
      </dl>

      <section aria-labelledby="scenario-quantities-heading">
        <h4 id="scenario-quantities-heading">{t('quantitiesHeading')}</h4>
        <p className="subtle-copy">{t('quantitiesNote')}</p>
        <table className="scenario-quantity-table">
          <caption className="sr-only">{t('quantitiesCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('colQuantity')}</th>
              <th scope="col">{t('colStatus')}</th>
              <th scope="col">{t('colReason')}</th>
            </tr>
          </thead>
          <tbody>
            {scenario.quantities.map((row) => (
              <tr key={row.quantity} data-quantity={row.quantity}>
                <th scope="row"><bdi dir="ltr">{t(`quantity.${row.quantity}` as 'quantity.W_IN')}</bdi></th>
                <td>{t('statusNotEstimable')}</td>
                <td>
                  <ul className="scenario-reason-list">
                    {row.reasons.map((reason, index) => (
                      <li key={`${reason.code}-${index}`} data-reason-code={reason.code}>
                        {reasonText(reason)}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="scenario-disclosures-heading">
        <h4 id="scenario-disclosures-heading">{t('disclosuresHeading')}</h4>
        <ul className="scenario-disclosure-list">
          {scenario.disclosures.map((code) => (
            <li key={code}>{t(`disclosure.${code}` as 'disclosure.HYPOTHETICAL_NOT_OBSERVED')}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function Fact({label, value}: {label: string; value: React.ReactNode}) {
  return <div className="result-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}
