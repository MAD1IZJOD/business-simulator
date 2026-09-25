import { useState } from 'react';
import { INDUSTRIES, INDUSTRY_LIST } from '../../engine/data/industries';
import { AUDIENCES, GTM, MONETIZATIONS } from '../../engine/data/businessModels';
import { MARKETS } from '../../engine/data/markets';
import { SEGMENTS } from '../../engine/data/segments';
import { DIFFICULTIES } from '../../engine/data/difficulty';
import { SCENARIO_BY_ID } from '../../engine/systems/scenarios';
import { defaultConfig } from '../../engine/create';
import type { Audience, Difficulty, GameConfig, GtmChannel, IndustryId, Monetization, SegmentId } from '../../engine/types';
import { game } from '../game/controller';
import { Field, Seg } from '../components/ui';
import { money, pct } from '../format';

const STEPS = ['Company', 'Industry', 'Business model', 'Starting conditions'];
const CAPITAL_PRESETS = [1000000, 5000000, 20000000, 100000000, 500000000];

function level(v: number): string {
  return v >= 0.75 ? 'Very high' : v >= 0.5 ? 'High' : v >= 0.3 ? 'Medium' : 'Low';
}

export function CreateCompany({ scenarioId, onBack }: { scenarioId: string | null; onBack: () => void }) {
  const sc = scenarioId ? SCENARIO_BY_ID[scenarioId] : null;
  const [step, setStep] = useState(0);
  const [c, setC] = useState<GameConfig>(() => {
    const industry: IndustryId = sc?.industry ?? 'saas';
    const ind = INDUSTRIES[industry];
    return defaultConfig({
      industry,
      monetization: ind.defaultMonetization,
      startingCapital: sc?.startingCapital ?? 5000000,
      scenarioId: sc?.id ?? null,
      audience: Object.keys(ind.adoption).some((k) => SEGMENTS[k as SegmentId].kind === 'business') && !(Object.keys(ind.adoption).some((k) => SEGMENTS[k as SegmentId].kind === 'consumer')) ? 'b2b' : 'b2c',
      targetSegment: (Object.keys(ind.adoption)[0] as SegmentId),
      seed: Math.floor(Math.random() * 1e9),
    });
  });
  const set = (patch: Partial<GameConfig>) => setC((x) => ({ ...x, ...patch }));
  const ind = INDUSTRIES[c.industry];
  const segs = (Object.keys(ind.adoption) as SegmentId[]).filter((k) => (ind.adoption[k] ?? 0) > 0);

  const chooseIndustry = (id: IndustryId) => {
    const d = INDUSTRIES[id];
    const s0 = (Object.keys(d.adoption) as SegmentId[]).sort((a, b) => (d.adoption[b] ?? 0) - (d.adoption[a] ?? 0))[0];
    const biz = SEGMENTS[s0].kind === 'business';
    set({ industry: id, monetization: d.defaultMonetization, targetSegment: s0, audience: biz ? 'b2b' : 'b2c', gtm: d.defaultMonetization === 'one_time' && d.requiresStores ? 'retail' : 'dtc' });
  };

  const canNext = step === 0 ? c.companyName.trim().length > 0 && c.founderName.trim().length > 0 : true;

  return (
    <main className="welcome">
      <div className="welcome-card panel" style={{ padding: 24 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <div>
            <h1>{sc ? `Scenario: ${sc.name}` : 'Create your company'}</h1>
            {sc && <p className="muted" style={{ marginTop: 4 }}>{sc.description}</p>}
          </div>
          <button type="button" className="btn ghost" onClick={onBack}>← Back</button>
        </div>
        <div className="wizard-steps" aria-label="Steps">
          {STEPS.map((st, i) => <span key={st} className={i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined}>{i + 1}. {st}</span>)}
        </div>

        {step === 0 && (
          <div className="grid g2">
            <Field label="Company name"><input className="input" value={c.companyName} maxLength={40} onChange={(e) => set({ companyName: e.target.value })} /></Field>
            <Field label="Founder name"><input className="input" value={c.founderName} maxLength={40} onChange={(e) => set({ founderName: e.target.value })} /></Field>
            <Field label="Headquarters" hint="Sets your home market, labour costs, rent and tax regime.">
              <select className="input" value={c.hqMarket} onChange={(e) => set({ hqMarket: e.target.value })}>
                {MARKETS.filter((m) => m.hqOption).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Company type">
              <select className="input" value={c.companyType} onChange={(e) => set({ companyType: e.target.value as GameConfig['companyType'] })}>
                <option value="private_limited">Private limited company</option>
                <option value="llp">Limited liability partnership</option>
                <option value="sole_proprietorship">Sole proprietorship</option>
              </select>
            </Field>
            <div className="span2"><Field label="Mission"><textarea className="input" rows={2} value={c.mission} maxLength={160} onChange={(e) => set({ mission: e.target.value })} /></Field></div>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <div className="choice-grid">
              {INDUSTRY_LIST.map((d) => (
                <button type="button" key={d.id} className="choice" aria-pressed={c.industry === d.id} onClick={() => chooseIndustry(d.id)} disabled={Boolean(sc?.lockIndustry && sc.industry !== d.id)}>
                  <span className="title"><span className="glyph" aria-hidden="true">{d.glyph}</span>{d.name}</span>
                  <span className="small muted">{d.description}</span>
                </button>
              ))}
            </div>
            <div className="panel" style={{ background: 'var(--panel-2)' }}>
              <h3 style={{ marginBottom: 10 }}>{ind.name} at a glance</h3>
              <div className="grid g4">
                <div><div className="faint small">Typical gross margin</div><strong>{pct(1 - ind.unitCostRatio, 0)}</strong></div>
                <div><div className="faint small">Market growth</div><strong>{pct(ind.growth, 0)}/yr</strong></div>
                <div><div className="faint small">Capital intensity</div><strong>{level(ind.capitalIntensity)}</strong></div>
                <div><div className="faint small">Regulation</div><strong>{level(ind.regulation)}</strong></div>
                <div><div className="faint small">Competition</div><strong>{level(ind.competition)}</strong></div>
                <div><div className="faint small">Recession sensitivity</div><strong>{ind.cyclicality < 0 ? 'Counter-cyclical' : level(ind.cyclicality / 1.5)}</strong></div>
                <div><div className="faint small">Fulfilment</div><strong>{ind.fulfillment}</strong></div>
                <div><div className="faint small">Reference price</div><strong>{ind.takeRate > 0 && ind.defaultMonetization !== 'one_time' ? `${ind.takeRate}%` : money(ind.basePrice)}</strong> <span className="faint small">{ind.priceUnit}</span></div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h3>How you make money</h3>
            <div className="choice-grid">
              {ind.monetizations.map((m: Monetization) => (
                <button type="button" key={m} className="choice" aria-pressed={c.monetization === m} onClick={() => set({ monetization: m })}>
                  <span className="title">{MONETIZATIONS[m].name}</span>
                  <span className="small muted">{MONETIZATIONS[m].description}</span>
                </button>
              ))}
            </div>
            <h3>How you reach customers</h3>
            <div className="choice-grid">
              {(Object.keys(GTM) as GtmChannel[]).map((g) => (
                <button type="button" key={g} className="choice" aria-pressed={c.gtm === g} onClick={() => set({ gtm: g })}>
                  <span className="title">{GTM[g].name}</span>
                  <span className="small muted">{GTM[g].description}</span>
                </button>
              ))}
            </div>
            <div className="grid g2">
              <Field label="Audience">
                <Seg label="Audience" value={c.audience} onChange={(v: Audience) => set({ audience: v })} options={(Object.keys(AUDIENCES) as Audience[]).map((a) => ({ id: a, label: AUDIENCES[a].name }))} />
              </Field>
              <Field label="Target customer segment" hint={SEGMENTS[c.targetSegment]?.description}>
                <select className="input" value={c.targetSegment} onChange={(e) => set({ targetSegment: e.target.value as SegmentId })}>
                  {segs.map((sg) => <option key={sg} value={sg}>{SEGMENTS[sg].name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h3>Difficulty</h3>
            <div className="choice-grid">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                <button type="button" key={d} className="choice" aria-pressed={c.difficulty === d} onClick={() => set({ difficulty: d })}>
                  <span className="title">{DIFFICULTIES[d].name}</span>
                  <span className="small muted">{DIFFICULTIES[d].description}</span>
                </button>
              ))}
            </div>
            <div className="grid g2">
              <Field label="Starting capital" hint={sc ? 'Set by the scenario.' : 'Your savings plus any pre-seed money.'}>
                <div className="row">
                  {CAPITAL_PRESETS.map((v) => <button type="button" key={v} className={`btn sm ${c.startingCapital === v ? 'active' : ''}`} disabled={Boolean(sc)} onClick={() => set({ startingCapital: v })}>{money(v)}</button>)}
                </div>
              </Field>
              <Field label="Starting strategy">
                <select className="input" value={c.strategy} onChange={(e) => set({ strategy: e.target.value as GameConfig['strategy'] })}>
                  <option value="cost_leadership">Cost leadership (budget positioning)</option>
                  <option value="differentiation">Differentiation (premium positioning)</option>
                  <option value="focus">Focus (mainstream, niche segment)</option>
                  <option value="innovation">Innovation</option>
                </select>
              </Field>
              <Field label="Risk tolerance">
                <Seg label="Risk tolerance" value={c.riskTolerance} onChange={(v) => set({ riskTolerance: v })} options={[{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }]} />
              </Field>
              <Field label="Tutorial">
                <label className="row"><input type="checkbox" checked={c.tutorial} onChange={(e) => set({ tutorial: e.target.checked })} /> Guide me through the basics (fewer bad surprises early on)</label>
              </Field>
              <Field label="Random seed" hint="The same seed and the same decisions reproduce the same game.">
                <input className="input num" value={c.seed} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ seed: Math.floor(Math.abs(v)) }); }} />
              </Field>
            </div>
            {c.difficulty === 'sandbox' && (
              <div className="panel" style={{ background: 'var(--panel-2)' }}>
                <h3 style={{ marginBottom: 10 }}>Sandbox options</h3>
                <div className="grid g2">
                  <Field label={`Market size ×${c.sandbox.marketSizeMult.toFixed(1)}`}><input type="range" min={0.3} max={5} step={0.1} value={c.sandbox.marketSizeMult} onChange={(e) => set({ sandbox: { ...c.sandbox, marketSizeMult: Number(e.target.value) } })} /></Field>
                  <Field label={`Competitors: ${c.sandbox.competitorCount}`}><input type="range" min={0} max={6} step={1} value={c.sandbox.competitorCount} onChange={(e) => set({ sandbox: { ...c.sandbox, competitorCount: Number(e.target.value) } })} /></Field>
                  <Field label={`Event frequency ×${c.sandbox.eventFrequency.toFixed(1)}`}><input type="range" min={0} max={3} step={0.1} value={c.sandbox.eventFrequency} onChange={(e) => set({ sandbox: { ...c.sandbox, eventFrequency: Number(e.target.value) } })} /></Field>
                  <Field label="Economy at start"><Seg label="Economy" value={c.sandbox.economy} onChange={(v) => set({ sandbox: { ...c.sandbox, economy: v } })} options={[{ id: 'normal', label: 'Normal' }, { id: 'boom', label: 'Boom' }, { id: 'recession', label: 'Recession' }]} /></Field>
                  <Field label="Starting capital (custom)"><input className="input num" value={c.startingCapital} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) set({ startingCapital: v }); }} /></Field>
                </div>
              </div>
            )}
            <div className="panel" style={{ background: 'var(--panel-2)' }}>
              <h3>Summary</h3>
              <p className="muted" style={{ marginTop: 6 }}>{c.companyName} — a {ind.name.toLowerCase()} company in {MARKETS.find((m) => m.id === c.hqMarket)?.name}, earning via {MONETIZATIONS[c.monetization].name.toLowerCase()}, selling {GTM[c.gtm].name.toLowerCase()} to {SEGMENTS[c.targetSegment].name.toLowerCase()}. Starting with {money(c.startingCapital)} on {DIFFICULTIES[c.difficulty].name}.</p>
            </div>
          </div>
        )}

        <div className="row between" style={{ marginTop: 20 }}>
          <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < STEPS.length - 1
            ? <button type="button" className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
            : <button type="button" className="btn primary lg" onClick={() => game.newGame(c)}>Found {c.companyName || 'company'}</button>}
        </div>
      </div>
    </main>
  );
}
