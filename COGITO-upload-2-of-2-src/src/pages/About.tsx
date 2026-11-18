import { useI18n } from '../i18n';
import { Card, H1, H2 } from '../ui/kit';

export function AboutPage() {
  const { t, tl } = useI18n();
  return (
    <div className="space-y-5">
      <H1>{t('about.title')}</H1>
      <Card glow="violet">
        <p className="text-sm leading-relaxed text-ink">{t('about.p1')}</p>
        <p className="mt-3 text-sm leading-relaxed text-warn">{t('about.p2')}</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <H2>{t('about.established')}</H2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
            {tl('about.estList').map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <H2>{t('about.experimental')}</H2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
            {tl('about.expList').map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <H2>{t('about.cogitoTitle')}</H2>
        <p className="text-sm leading-relaxed text-ink">{t('about.cogitoP1')}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink">{t('about.cogitoP2')}</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-dim">
          {tl('about.cogitoList').map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <H2>{t('about.reference')}</H2>
        <p className="text-sm text-ink">
          Computerized cognitive training for memory functions in mild cognitive impairment or dementia: a systematic review and meta-analysis. <i>npj Digital Medicine</i>.
        </p>
        <p className="mt-1 break-all font-mono text-xs text-volt">https://www.nature.com/articles/s41746-023-00987-5</p>
        <p className="mt-3 text-sm text-ink">
          Schmiedek, F., Lövdén, M., &amp; Lindenberger, U. (2010). Hundred days of cognitive training enhance broad cognitive abilities in adulthood: findings from the COGITO study. <i>Frontiers in Aging Neuroscience</i>, 2, 27.
        </p>
      </Card>
    </div>
  );
}
