'use client';

import {useLocale, useTranslations} from 'next-intl';
import {formatPercent, formatValue} from '@/lib/format';
import type {AnalysisResult} from '@/lib/api/client';

type QualityEvidencePanelProps = {
  result: AnalysisResult;
};

/**
 * Evidence-only presentation of fields already returned by the pinned result contract.
 * The bars are a visual aid, not a score or a scientific threshold.
 */
export function QualityEvidencePanel({result}: QualityEvidencePanelProps) {
  const t = useTranslations('workspace');
  const locale = useLocale();
  const statistics = result.statistics;
  const scenes = result.scenes_evaluated ?? [];
  const baseline = result.baseline;

  return (
    <section className="result-detail-section quality-evidence" aria-labelledby="quality-evidence-heading">
      <div className="section-heading-with-note">
        <div>
          <h3 id="quality-evidence-heading">{t('qualityEvidenceHeading')}</h3>
          <p className="subtle-copy">{t('qualityEvidenceDescription')}</p>
        </div>
        <span className="legend-note"><span className="legend-swatch" aria-hidden="true" />{t('coverageLegend')}</span>
      </div>

      {scenes.length > 0 ? (
        <div className="evidence-chart" role="img" aria-label={t('coverageChartLabel')}>
          {scenes.map((scene) => {
            const value = scene.valid_coverage_fraction;
            const width = value === null ? 0 : Math.max(0, Math.min(100, value * 100));
            return (
              <div className="evidence-chart-row" key={`${scene.acquisition_date}-${scene.item_ids?.join('|') ?? ''}`}>
                <bdi dir="ltr" className="evidence-chart-label">{scene.acquisition_date}</bdi>
                {/* Round-5 C-03: same direction isolation as the zone evidence chart — the coverage
                    plot is a magnitude axis and never mirrors under RTL. */}
                <div className="evidence-chart-track" aria-hidden="true">
                  <span className={`evidence-chart-bar${scene.selected ? ' is-selected' : ''}`} style={{width: `${width}%`}} />
                </div>
                <span className="evidence-chart-value">{value === null ? t('notReturned') : formatPercent(value, locale)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="subtle-copy">{t('coverageChartUnavailable')}</p>
      )}

      {statistics ? (
        <div className="quality-evidence-grid">
          <details className="result-disclosure">
            <summary><h4>{t('rejectionCountsHeading')}</h4></summary>
            <dl className="result-facts compact-facts">
              <Fact label={t('rejectionMaskedClass')} value={formatValue(statistics.rejection_counts.masked_class, locale, 0)} />
              <Fact label={t('rejectionMissingData')} value={formatValue(statistics.rejection_counts.missing_data, locale, 0)} />
              <Fact label={t('rejectionNonPositive')} value={formatValue(statistics.rejection_counts.non_positive_denominator, locale, 0)} />
              <Fact label={t('rejectionOutOfRange')} value={formatValue(statistics.rejection_counts.out_of_range, locale, 0)} />
            </dl>
          </details>
          <details className="result-disclosure">
            <summary><h4>{t('baselineHeading')}</h4></summary>
            <dl className="result-facts compact-facts">
              <Fact label={t('baselineCollection')} value={<bdi dir="auto">{baseline.collection}</bdi>} />
              <Fact label={t('baselineContract')} value={<bdi dir="ltr">{baseline.contract_version}</bdi>} />
              <Fact label={t('baselinePipeline')} value={<bdi dir="ltr">{baseline.pipeline_version}</bdi>} />
              <Fact label={t('baselineMaskPolicy')} value={<bdi dir="ltr">{baseline.mask_policy_version}</bdi>} />
              <Fact label={t('baselineResolution')} value={`${formatValue(baseline.grid_resolution_m, locale)} m`} />
            </dl>
          </details>
        </div>
      ) : null}
      <p className="science-disclosure">{t('qualityEvidenceDisclosure')}</p>
    </section>
  );
}

function Fact({label, value}: {label: string; value: React.ReactNode}) {
  return <div className="result-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}
