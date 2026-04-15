import { useState } from 'react';

const GEOS     = ['Saudi Arabia','Kuwait','UAE','Qatar','Bahrain','Oman','Multiple'];
const SECTORS  = ['Banking & financial services','Oil & gas','Government','Healthcare','Telecoms','Retail / e-commerce','Technology / SaaS','Other'];
const DATA     = ['Personal data of GCC residents','Payment card data','CNI operator (central bank, utility, telecoms, government)'];

export default function IntakeForm({ onSubmit }) {
  const [geo,      setGeo]      = useState('');
  const [sector,   setSector]   = useState('');
  const [dataTypes,setDataTypes]= useState([]);
  const [listed,   setListed]   = useState(false);
  const [loading,  setLoading]  = useState(false);

  function toggleData(d) {
    setDataTypes(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev, d]);
  }

  async function handleSubmit() {
    if (!geo || !sector) return;
    setLoading(true);
    await onSubmit({ geography: geo, sector, dataTypes, stockExchangeListed: listed });
    setLoading(false);
  }

  return (
    <div className="card" style={{ maxWidth: '580px', margin: '0 auto' }}>
      <div className="step-label">Step 1 of 5 — Organisation profile</div>
      <h2 className="step-title">Tell us about your organisation</h2>
      <p className="step-sub">We'll recommend the regulatory frameworks most applicable to your situation.</p>

      <div className="field">
        <label className="field-label">Primary geography</label>
        <div className="chip-row">
          {GEOS.map(g => <button key={g} className={`chip ${geo===g?'chip-active':''}`} onClick={()=>setGeo(g)}>{g}</button>)}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Primary sector</label>
        <div className="chip-row">
          {SECTORS.map(s => <button key={s} className={`chip ${sector===s?'chip-active':''}`} onClick={()=>setSector(s)}>{s}</button>)}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Applicable characteristics (select all that apply)</label>
        <div className="chip-row">
          {DATA.map(d => <button key={d} className={`chip ${dataTypes.includes(d)?'chip-active':''}`} onClick={()=>toggleData(d)}>{d}</button>)}
        </div>
        {dataTypes.includes('CNI operator (central bank, utility, telecoms, government)') && (
          <p style={{ fontSize: '11px', color: '#555', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px', marginTop: '8px', lineHeight: 1.6 }}>
            <strong>Critical National Infrastructure (CNI)</strong> refers to organisations whose disruption would have a significant impact on national security, the economy, or public safety. In the GCC context this includes central banks, power and water utilities, oil &amp; gas operators, telecoms providers, and core government entities.
            Selecting this triggers stricter obligations under <strong>NCA-ECC</strong> and <strong>UAE NIAF</strong>, and makes <strong>IEC 62443</strong> (OT/ICS security) relevant if your organisation operates industrial control systems.
            <br /><em>A commercial bank regulated by CBK or SAMA is not itself CNI — it is regulated by a CNI entity. Only select this if your organisation is the infrastructure operator.</em>
          </p>
        )}
      </div>

      <div className="field">
        <label className="field-label">Stock exchange listed?</label>
        <div className="chip-row">
          <button className={`chip ${listed?'chip-active':''}`} onClick={()=>setListed(true)}>Yes</button>
          <button className={`chip ${!listed?'chip-active':''}`} onClick={()=>setListed(false)}>No</button>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSubmit} disabled={!geo||!sector||loading} style={{marginTop:'8px'}}>
        {loading ? 'Getting recommendations…' : 'Get framework recommendations →'}
      </button>
    </div>
  );
}
