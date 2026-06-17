"use client";

import { useState, useMemo, useRef } from "react";

const fmt = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
};
const fmtN = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : Math.round(n).toString();
const pct = (n: number) => `${(n*100).toFixed(1)}%`;
const mo = (n: number) => `${Math.round(n)} mo`;
const x = (n: number) => `${n.toFixed(2)}x`;

const TABS = ["Dashboard","Revenue","Unit Economics","Cash Flow","Burn Score","SAFE Modeler","Scenarios"];

const scoreColor = (val: number, good: number, warn: number) => {
  if (val >= good) return "var(--color-text-success)";
  if (val >= warn) return "var(--color-text-warning)";
  return "var(--color-text-danger)";
};

const scenarioMods: Record<string, { growthMod: number; churnMod: number; marginMod: number }> = {
  bear:     { growthMod: 0.6, churnMod: 1.5, marginMod: 0.9 },
  base:     { growthMod: 1.0, churnMod: 1.0, marginMod: 1.0 },
  bull:     { growthMod: 1.5, churnMod: 0.7, marginMod: 1.05 },
  investor: { growthMod: 1.8, churnMod: 0.6, marginMod: 1.08 },
};

function NumInput({ label, value, min, max, step, display, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const displayed = display ? display(value) : value;

  const commit = () => {
    const cleaned = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    if (!isNaN(cleaned)) {
      onChange(Math.min(max, Math.max(min, cleaned)));
    }
    setEditing(false);
  };

  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{label}</span>
        {editing ? (
          <input autoFocus value={raw}
            onChange={e=>setRaw(e.target.value)}
            onBlur={commit}
            onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEditing(false);}}
            style={{width:80,fontSize:12,textAlign:"right",padding:"1px 4px",
              border:"1px solid var(--color-border-info)",borderRadius:4,
              background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
        ) : (
          <span onClick={()=>{setRaw(String(value));setEditing(true);}}
            title="Click to type exact value"
            style={{fontSize:12,fontWeight:500,cursor:"text",padding:"1px 4px",
              borderRadius:3,border:"1px solid transparent",
              transition:"border-color 0.15s"}}
            onMouseEnter={(e)=>(e.currentTarget.style.borderColor="var(--color-border-info)")}
            onMouseLeave={(e)=>(e.currentTarget.style.borderColor="transparent")}>
            {displayed}
          </span>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(parseFloat(e.target.value))} style={{width:"100%"}} />
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("Dashboard");
  const [inputs, setInputs] = useState({
    startingMRR: 8000,
    newCustsPerMonth: 8,
    acv: 1200,
    churnRate: 0.025,
    expansionRate: 0.01,
    grossMargin: 0.74,
    cac: 1200,
    monthlyBurn: 38000,
    seedRaise: 750000,
    existingCash: 120000,
    scenario: "base",
    safeAmount: 350000,
    safeCap: 6000000,
    safeDiscount: 0.20,
    postMoneyShares: 1000000,
    pricePerShare: 1.00,
    nextRaiseTarget: 1000000,
  });
  const set = (k: string, v: number | string) => setInputs(p => ({...p, [k]: v}));
  const chartRef = useRef(null);

  const model = useMemo(() => {
    const mod = scenarioMods[inputs.scenario];
    const months: {
      m: number; mrr: number; arr: number; custs: number;
      newMRR: number; churnedMRR: number; expansionMRR: number;
      revenue: number; grossProfit: number; burn: number; cash: number;
      nrr: number; burnMultiple: number;
    }[] = [];
    let mrr = inputs.startingMRR;
    let custs = Math.max(1, Math.round(inputs.startingMRR / (inputs.acv / 12)));
    let cash = inputs.existingCash + inputs.seedRaise;
    const churn = inputs.churnRate * mod.churnMod;
    const gm = Math.min(0.99, inputs.grossMargin * mod.marginMod);
    const newPerMo = inputs.newCustsPerMonth * mod.growthMod;
    let totalNewARR = 0, totalBurn = 0;
    let m1mARR = -1, nextRaiseMo = -1, defaultAliveMo = -1;

    for (let m = 1; m <= 36; m++) {
      const newMRR = newPerMo * (inputs.acv / 12);
      const churnedMRR = mrr * churn;
      const expansionMRR = mrr * inputs.expansionRate;
      const endMRR = Math.max(0, mrr + newMRR - churnedMRR + expansionMRR);
      const arr = endMRR * 12;
      const revenue = endMRR;
      const grossProfit = revenue * gm;
      const burn = Math.max(0, inputs.monthlyBurn - grossProfit);
      cash -= burn;
      custs = Math.max(0, custs + newPerMo - custs * churn);
      totalNewARR += newMRR * 12;
      totalBurn += burn;
      const burnMultiple = totalNewARR > 0 ? totalBurn / totalNewARR : 999;

      if (m1mARR < 0 && arr >= 1000000) m1mARR = m;
      if (nextRaiseMo < 0 && arr >= inputs.nextRaiseTarget) nextRaiseMo = m;
      if (defaultAliveMo < 0 && grossProfit >= inputs.monthlyBurn) defaultAliveMo = m;

      months.push({
        m, mrr: endMRR, arr, custs: Math.round(custs),
        newMRR, churnedMRR, expansionMRR,
        revenue, grossProfit, burn, cash,
        nrr: mrr > 0 ? endMRR / mrr : 1,
        burnMultiple,
      });
      mrr = endMRR;
    }

    const ltv = (inputs.acv * gm) / churn;
    const ltvcac = inputs.cac > 0 ? ltv / inputs.cac : 0;
    const cacPayback = (inputs.acv / 12) * gm > 0 ? inputs.cac / ((inputs.acv / 12) * gm) : 999;
    const runwayIdx = months.findIndex(m => m.cash <= 0);
    const runway = runwayIdx === -1 ? 36 : runwayIdx;
    const fundingGap = runwayIdx === -1 ? 0 : Math.abs(months[months.length-1].cash);
    const m12 = months[11], m24 = months[23], m36 = months[35];

    const capConvPrice = inputs.safeCap / inputs.postMoneyShares;
    const discountConvPrice = inputs.pricePerShare * (1 - inputs.safeDiscount);
    const convPrice = Math.min(capConvPrice, discountConvPrice);
    const safeShares = convPrice > 0 ? Math.round(inputs.safeAmount / convPrice) : 0;
    const totalShares = inputs.postMoneyShares + safeShares;
    const founderPct = inputs.postMoneyShares / totalShares;
    const investorPct = safeShares / totalShares;
    const impliedValuation = inputs.postMoneyShares * inputs.pricePerShare;

    return {
      months, ltv, ltvcac, cacPayback, runway, fundingGap,
      m12, m24, m36, gm, churn,
      finalBurnMultiple: months[35].burnMultiple,
      safeShares, totalShares, founderPct, investorPct,
      convPrice, capConvPrice, discountConvPrice, impliedValuation,
      m1mARR, nextRaiseMo, defaultAliveMo,
    };
  }, [inputs]);

  const card = (label: string, value: string, sub?: string, color?: string) => (
    <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px"}}>
      <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>{label}</div>
      <div style={{fontSize:20,fontWeight:500,color:color||"var(--color-text-primary)"}}>{value}</div>
      {sub && <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:2}}>{sub}</div>}
    </div>
  );

  const burnLabel = (bm: number) => {
    if (bm <= 1) return {label:"Exceptional",color:"var(--color-text-success)"};
    if (bm <= 1.5) return {label:"Good",color:"var(--color-text-success)"};
    if (bm <= 2) return {label:"Acceptable",color:"var(--color-text-warning)"};
    if (bm <= 3) return {label:"High",color:"var(--color-text-warning)"};
    return {label:"Unsustainable",color:"var(--color-text-danger)"};
  };

  const MilestoneChart = ({ data, valueKey, color="#378ADD", height=160, negKey=false, milestones=[] }: {
    data: Record<string, number>[];
    valueKey: string;
    color?: string;
    height?: number;
    negKey?: boolean;
    milestones?: { mo: number; label: string }[];
  }) => {
    const vals = data.map(d => Math.abs(d[valueKey]));
    const max = Math.max(...vals, 1);

    // Stagger vertically when two milestones are within 4 months of each other
    const milestoneStagger: Record<number, number> = {};
    [...milestones].sort((a, b) => a.mo - b.mo).forEach((ml, idx, arr) => {
      const prev = arr[idx - 1];
      milestoneStagger[ml.mo] = prev && (ml.mo - prev.mo) < 5 ? 14 : 0;
    });

    return (
      <div style={{position:"relative"}}>
        {/* alignItems:stretch gives each column a defined height so height:% on bars resolves correctly */}
        <div style={{display:"flex",alignItems:"stretch",gap:2,height,paddingTop:32,position:"relative"}}>
          {data.map((d,i) => {
            const c = negKey ? (d[valueKey] > 0 ? "#E24B4A" : "#1D9E75") : color;
            const barH = Math.max(2,(Math.abs(d[valueKey])/max)*100);
            const isMilestone = milestones.find(ml => ml.mo === d.m);
            const staggerTop = isMilestone ? (milestoneStagger[d.m] ?? 0) : 0;
            // Near right edge: anchor label to the right so it doesn't overflow
            const isRightEdge = d.m > 30;
            const isLeftEdge = d.m < 5;
            const labelPos = isRightEdge
              ? {right:0}
              : isLeftEdge
              ? {left:0}
              : {left:"50%",transform:"translateX(-50%)"};
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end",alignItems:"center",position:"relative",minWidth:0}}>
                {isMilestone && (
                  <div style={{position:"absolute",top:staggerTop,...labelPos,
                    fontSize:9,background:"var(--color-background-info)",color:"var(--color-text-info)",
                    border:"0.5px solid var(--color-border-info)",borderRadius:3,
                    padding:"1px 3px",whiteSpace:"nowrap",zIndex:2,fontWeight:600}}>
                    {isMilestone.label}
                  </div>
                )}
                <div title={`Mo ${d.m}: ${fmt(d[valueKey])}`}
                  style={{width:"100%",background: isMilestone?"#EF9F27":c,
                    borderRadius:"2px 2px 0 0",opacity:0.85,
                    height:`${barH}%`,
                    border:isMilestone?"1px solid #EF9F27":"none"}} />
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--color-text-tertiary)",marginTop:6}}>
          <span>Mo 1</span><span>Mo 12</span><span>Mo 24</span><span>Mo 36</span>
        </div>
      </div>
    );
  };

  const getMilestones = () => {
    const ms: { mo: number; label: string }[] = [];
    if (model.m1mARR > 0 && model.m1mARR <= 36) ms.push({mo: model.m1mARR, label:"$1M ARR"});
    if (model.nextRaiseMo > 0 && model.nextRaiseMo <= 36 && model.nextRaiseMo !== model.m1mARR)
      ms.push({mo: model.nextRaiseMo, label:"Raise ↑"});
    if (model.defaultAliveMo > 0 && model.defaultAliveMo <= 36)
      ms.push({mo: model.defaultAliveMo, label:"Default Alive"});
    if (model.runway < 36) ms.push({mo: model.runway, label:"⚠ Cash Out"});
    return ms;
  };

  const copySummary = () => {
    const lines = [
      "PRE-SEED SAAS FINANCIAL MODEL — SUMMARY",
      "========================================",
      `ARR Year 1:        ${fmt(model.m12.arr)}`,
      `ARR Year 2:        ${fmt(model.m24.arr)}`,
      `ARR Year 3:        ${fmt(model.m36.arr)}`,
      `Customers (Mo 36): ${fmtN(model.m36.custs)}`,
      `Runway:            ${model.runway===36?"36+ mo":mo(model.runway)}`,
      `Funding Gap:       ${model.fundingGap>0?fmt(model.fundingGap):"None"}`,
      "",
      "UNIT ECONOMICS",
      "--------------",
      `LTV:               ${fmt(model.ltv)}`,
      `CAC:               ${fmt(inputs.cac)}`,
      `LTV:CAC:           ${x(model.ltvcac)}`,
      `CAC Payback:       ${mo(model.cacPayback)}`,
      `Gross Margin:      ${pct(model.gm)}`,
      `Monthly Churn:     ${pct(model.churn)}`,
      `Burn Multiple:     ${model.finalBurnMultiple>10?"10x+":x(model.finalBurnMultiple)} (${burnLabel(model.finalBurnMultiple).label})`,
      "",
      "MILESTONES",
      "----------",
      model.m1mARR>0?`$1M ARR:           Month ${model.m1mARR}`:"$1M ARR: Not reached in 36 mo",
      model.defaultAliveMo>0?`Default Alive:     Month ${model.defaultAliveMo}`:"Default Alive: Not reached in 36 mo",
      "",
      "SAFE CONVERSION",
      "---------------",
      `Investment:        ${fmt(inputs.safeAmount)}`,
      `Valuation Cap:     ${fmt(inputs.safeCap)}`,
      `Conv. Price:       $${model.convPrice.toFixed(2)}`,
      `Founder Ownership: ${pct(model.founderPct)}`,
      `Investor Ownership:${pct(model.investorPct)}`,
      "",
      `Scenario: ${inputs.scenario.toUpperCase()}`,
      "Generated with Pre-Seed SaaS Financial Model",
    ].join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      alert("Summary copied to clipboard — paste into any doc or email.");
    });
  };

  const inp = (label: string, key: string, min: number, max: number, step: number, display?: (v: number) => string) => (
    <NumInput label={label} value={inputs[key as keyof typeof inputs] as number} min={min} max={max} step={step}
      display={display} onChange={v=>set(key,v)} />
  );

  const sidePanel = (
    <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
      <div style={{fontSize:13,fontWeight:500,marginBottom:2}}>Model inputs</div>
      <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:12}}>Slide or click value to type exact number</div>
      {inp("Starting MRR","startingMRR",500,50000,500,fmt)}
      {inp("New customers/mo","newCustsPerMonth",1,100,1,v=>`${Math.round(v)} custs`)}
      {inp("ACV (annual)","acv",100,10000,100,fmt)}
      {inp("Monthly churn","churnRate",0.005,0.15,0.005,pct)}
      {inp("Expansion MRR rate","expansionRate",0,0.05,0.005,pct)}
      {inp("Gross margin","grossMargin",0.3,0.95,0.01,pct)}
      {inp("CAC","cac",100,5000,100,fmt)}
      {inp("Monthly burn","monthlyBurn",5000,200000,5000,fmt)}
      {inp("Seed raise","seedRaise",0,5000000,50000,fmt)}
      {inp("Existing cash","existingCash",0,1000000,10000,fmt)}
      <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:12,marginTop:4}}>
        {inp("Next raise ARR target","nextRaiseTarget",100000,5000000,100000,fmt)}
        <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:-10,marginBottom:14}}>Shows milestone marker on charts</div>
      </div>
      <button onClick={copySummary}
        style={{width:"100%",padding:"8px",fontSize:12,borderRadius:"var(--border-radius-md)",
          background:"var(--color-background-info)",color:"var(--color-text-info)",
          border:"0.5px solid var(--color-border-info)",cursor:"pointer",fontWeight:500}}>
        Copy summary to clipboard
      </button>
    </div>
  );

  const milestones = getMilestones();

  return (
    <div style={{fontFamily:"var(--font-sans)",padding:"1rem 0"}}>
      <h2 style={{fontSize:18,fontWeight:500,marginBottom:4}}>Pre-seed SaaS financial model</h2>
      <p style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:16}}>
        36-month engine · burn scoring · SAFE modeler · milestone tracking
      </p>

      {milestones.length > 0 && (
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {model.m1mARR>0&&model.m1mARR<=36&&<span style={{fontSize:12,padding:"3px 10px",borderRadius:20,background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)"}}>$1M ARR → Month {model.m1mARR}</span>}
          {model.defaultAliveMo>0&&model.defaultAliveMo<=36&&<span style={{fontSize:12,padding:"3px 10px",borderRadius:20,background:"var(--color-background-success)",color:"var(--color-text-success)",border:"0.5px solid var(--color-border-success)"}}>Default Alive → Month {model.defaultAliveMo}</span>}
          {model.nextRaiseMo>0&&model.nextRaiseMo<=36&&<span style={{fontSize:12,padding:"3px 10px",borderRadius:20,background:"var(--color-background-warning)",color:"var(--color-text-warning)",border:"0.5px solid var(--color-border-warning)"}}>Next Raise Target → Month {model.nextRaiseMo}</span>}
          {model.runway<36&&<span style={{fontSize:12,padding:"3px 10px",borderRadius:20,background:"var(--color-background-danger)",color:"var(--color-text-danger)",border:"0.5px solid var(--color-border-danger)"}}>⚠ Cash Out → Month {model.runway}</span>}
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"6px 12px",fontSize:12,borderRadius:"var(--border-radius-md)",
              background:tab===t?"var(--color-background-info)":"transparent",
              color:tab===t?"var(--color-text-info)":"var(--color-text-secondary)",
              border:tab===t?"0.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)",
              cursor:"pointer"}}>
            {t}
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 250px",gap:16,alignItems:"start"}}>
        <div>
          {tab==="Dashboard" && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
                {card("ARR — year 1", fmt(model.m12.arr),"month 12")}
                {card("ARR — year 2", fmt(model.m24.arr),"month 24")}
                {card("ARR — year 3", fmt(model.m36.arr),"month 36")}
                {card("Customers (mo 36)", fmtN(model.m36.custs),"total")}
                {card("Runway", model.runway===36?"36+ mo":mo(model.runway), inputs.scenario,
                  model.runway>=18?"var(--color-text-success)":model.runway>=9?"var(--color-text-warning)":"var(--color-text-danger)")}
                {card("Burn multiple", model.finalBurnMultiple>10?"10x+":x(model.finalBurnMultiple),"yr 3", burnLabel(model.finalBurnMultiple).color)}
                {card("LTV:CAC", x(model.ltvcac),"target 3x+", scoreColor(model.ltvcac,3,1.5))}
                {card("Funding gap", model.fundingGap>0?fmt(model.fundingGap):"None","36 mo",
                  model.fundingGap===0?"var(--color-text-success)":"var(--color-text-danger)")}
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>MRR growth — 36 months</div>
                <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:4}}>Orange bars = milestone months</div>
                <MilestoneChart data={model.months} valueKey="mrr" color="#378ADD" height={160} milestones={milestones} />
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:8}}>Cash position — 36 months</div>
                <MilestoneChart data={model.months} valueKey="cash" height={120} negKey={true} milestones={milestones} />
              </div>
            </>
          )}

          {tab==="Revenue" && (
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
              <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:12}}>Month-by-month revenue breakdown</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                      {["Mo","MRR","ARR","Custs","New MRR","Churned","Expansion","NRR"].map(h=>(
                        <th key={h} style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-secondary)",fontWeight:400}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.months.filter((_,i)=>[0,2,5,8,11,17,23,29,35].includes(i)).map(d=>{
                      const isMo = milestones.find(ml=>ml.mo===d.m);
                      return (
                        <tr key={d.m} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",
                          background:isMo?"var(--color-background-warning)":"transparent"}}>
                          <td style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-secondary)"}}>
                            {d.m}{isMo?` (${isMo.label})`:""}
                          </td>
                          <td style={{padding:"6px 8px",textAlign:"right"}}>{fmt(d.mrr)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right"}}>{fmt(d.arr)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right"}}>{d.custs}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-success)"}}>{fmt(d.newMRR)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-danger)"}}>-{fmt(d.churnedMRR)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-info)"}}>{fmt(d.expansionMRR)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",color:d.nrr>=1?"var(--color-text-success)":"var(--color-text-danger)"}}>{pct(d.nrr)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab==="Unit Economics" && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
                {card("LTV", fmt(model.ltv),"lifetime value")}
                {card("CAC", fmt(inputs.cac),"acquisition cost")}
                {card("LTV:CAC", x(model.ltvcac),"target 3x+", scoreColor(model.ltvcac,3,1.5))}
                {card("CAC payback", mo(model.cacPayback),"target <18 mo", scoreColor(18-model.cacPayback,6,0))}
                {card("Gross margin", pct(model.gm),"target 70%+", scoreColor(model.gm,0.70,0.55))}
                {card("Monthly churn", pct(model.churn),"target <2%", scoreColor(0.05-model.churn,0.03,0.01))}
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:12}}>Investor health check</div>
                {[
                  {label:"LTV:CAC ratio", val:x(model.ltvcac), good:model.ltvcac>=3, warn:model.ltvcac>=1.5, tip:"Investors want 3x+"},
                  {label:"CAC payback period", val:mo(model.cacPayback), good:model.cacPayback<=12, warn:model.cacPayback<=18, tip:"Under 18 months acceptable"},
                  {label:"Gross margin", val:pct(model.gm), good:model.gm>=0.70, warn:model.gm>=0.55, tip:"SaaS benchmark: 70–80%"},
                  {label:"Monthly churn", val:pct(model.churn), good:model.churn<=0.02, warn:model.churn<=0.04, tip:"Under 2% monthly is healthy"},
                  {label:"Runway", val:model.runway===36?"36+ mo":mo(model.runway), good:model.runway>=18, warn:model.runway>=9, tip:"18+ months target"},
                  {label:"Burn multiple (yr 3)", val:model.finalBurnMultiple>10?"10x+":x(model.finalBurnMultiple), good:model.finalBurnMultiple<=1.5, warn:model.finalBurnMultiple<=2.5, tip:"Under 1.5x is strong in 2026"},
                ].map(r=>(
                  <div key={r.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                    <div>
                      <div style={{fontSize:13}}>{r.label}</div>
                      <div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{r.tip}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:14,fontWeight:500}}>{r.val}</span>
                      <span style={{fontSize:16,color:r.good?"var(--color-text-success)":r.warn?"var(--color-text-warning)":"var(--color-text-danger)"}}>{r.good?"✓":r.warn?"~":"✗"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab==="Cash Flow" && (
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
              <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:12}}>Cash position over 36 months</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                      {["Mo","Revenue","Gross Profit","Net Burn","Ending Cash"].map(h=>(
                        <th key={h} style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-secondary)",fontWeight:400}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.months.filter((_,i)=>[0,2,5,8,11,17,23,29,35].includes(i)).map(d=>{
                      const isMo = milestones.find(ml=>ml.mo===d.m);
                      return (
                        <tr key={d.m} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",
                          background:isMo?"var(--color-background-warning)":"transparent"}}>
                          <td style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-secondary)"}}>{d.m}</td>
                          <td style={{padding:"6px 8px",textAlign:"right"}}>{fmt(d.revenue)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",color:"var(--color-text-success)"}}>{fmt(d.grossProfit)}</td>
                          <td style={{padding:"6px 8px",textAlign:"right",color:d.burn>0?"var(--color-text-danger)":"var(--color-text-success)"}}>
                            {d.burn>0?`-${fmt(d.burn)}`:`+${fmt(Math.abs(d.burn))}`}
                          </td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontWeight:500,
                            color:d.cash>0?"var(--color-text-success)":"var(--color-text-danger)"}}>{fmt(d.cash)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab==="Burn Score" && (
            <>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"16px",marginBottom:14}}>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.6}}>
                  <strong>Burn multiple</strong> = net cash burned ÷ net new ARR. Investors use this to judge capital efficiency. Under 1.5x is strong in 2026. Over 2x requires explanation.
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
                {card("Burn multiple (yr 3)", model.finalBurnMultiple>10?"10x+":x(model.finalBurnMultiple),"cumulative", burnLabel(model.finalBurnMultiple).color)}
                {card("Rating", burnLabel(model.finalBurnMultiple).label,"2026 benchmark", burnLabel(model.finalBurnMultiple).color)}
                {card("Monthly burn", fmt(inputs.monthlyBurn),"gross spend")}
                {card("Gross margin", pct(model.gm),"efficiency")}
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px",marginBottom:14}}>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>Burn multiple trend</div>
                <div style={{display:"flex",alignItems:"flex-end",gap:2,height:140}}>
                  {model.months.map((d,i)=>{
                    const bm = Math.min(d.burnMultiple,10);
                    const c = bm<=1.5?"#1D9E75":bm<=2.5?"#EF9F27":"#E24B4A";
                    return <div key={i} title={`Mo ${d.m}: ${bm.toFixed(2)}x`}
                      style={{flex:1,background:c,borderRadius:"2px 2px 0 0",opacity:0.85,
                        height:`${Math.max(2,(bm/10)*100)}%`,minWidth:0}} />;
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--color-text-tertiary)",marginTop:4}}>
                  <span>Mo 1</span><span>Mo 12</span><span>Mo 24</span><span>Mo 36</span>
                </div>
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
                {[
                  {range:"Under 1x", label:"Exceptional", bm:1},
                  {range:"1x – 1.5x", label:"Good — efficient growth", bm:1.5},
                  {range:"1.5x – 2x", label:"Acceptable — investable", bm:2},
                  {range:"2x – 3x", label:"High — needs explanation", bm:3},
                  {range:"Over 3x", label:"Unsustainable — red flag", bm:99},
                ].map((r,i,arr)=>{
                  const prev = i===0?0:arr[i-1].bm;
                  const isHere = model.finalBurnMultiple>prev && model.finalBurnMultiple<=r.bm;
                  return (
                    <div key={r.range} style={{display:"flex",justifyContent:"space-between",
                      padding:"7px 8px",borderBottom:"0.5px solid var(--color-border-tertiary)",
                      alignItems:"center",borderRadius:isHere?4:0,
                      background:isHere?"var(--color-background-info)":"transparent"}}>
                      <span style={{fontSize:13,fontWeight:500,minWidth:90}}>{r.range}</span>
                      <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{r.label}</span>
                      {isHere && <span style={{fontSize:11,fontWeight:600,color:"var(--color-text-info)"}}>← you</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab==="SAFE Modeler" && (
            <>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px",marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:500,marginBottom:12}}>SAFE inputs</div>
                <NumInput label="SAFE investment amount" value={inputs.safeAmount} min={10000} max={2000000} step={10000} display={fmt} onChange={v=>set("safeAmount",v)} />
                <NumInput label="Valuation cap" value={inputs.safeCap} min={1000000} max={30000000} step={250000} display={fmt} onChange={v=>set("safeCap",v)} />
                <NumInput label="Discount rate" value={inputs.safeDiscount} min={0} max={0.40} step={0.05} display={pct} onChange={v=>set("safeDiscount",v)} />
                <NumInput label="Post-money shares (next round)" value={inputs.postMoneyShares} min={500000} max={5000000} step={50000} display={v=>`${(v/1e6).toFixed(2)}M shares`} onChange={v=>set("postMoneyShares",v)} />
                <NumInput label="Price per share (next round)" value={inputs.pricePerShare} min={0.10} max={20} step={0.10} display={v=>`$${v.toFixed(2)}`} onChange={v=>set("pricePerShare",v)} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
                {card("SAFE investment", fmt(inputs.safeAmount))}
                {card("Cap conv. price", `$${model.capConvPrice.toFixed(2)}`,"from cap")}
                {card("Discount conv. price", `$${model.discountConvPrice.toFixed(2)}`,"from discount")}
                {card("Effective conv. price", `$${model.convPrice.toFixed(2)}`,"lower of two")}
                {card("SAFE shares issued", fmtN(model.safeShares),"at conversion")}
                {card("Investor ownership", pct(model.investorPct),"post-conversion", model.investorPct>0.25?"var(--color-text-danger)":model.investorPct>0.15?"var(--color-text-warning)":"var(--color-text-success)")}
                {card("Founder ownership", pct(model.founderPct),"post-conversion", model.founderPct>=0.75?"var(--color-text-success)":model.founderPct>=0.60?"var(--color-text-warning)":"var(--color-text-danger)")}
                {card("Implied valuation", fmt(model.impliedValuation),"pre-money")}
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:10}}>Ownership at conversion</div>
                <div style={{display:"flex",height:32,borderRadius:"var(--border-radius-md)",overflow:"hidden",marginBottom:10}}>
                  <div style={{width:`${model.founderPct*100}%`,background:"#378ADD",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:500}}>
                    {model.founderPct>0.15?`Founder ${pct(model.founderPct)}`:""}
                  </div>
                  <div style={{width:`${model.investorPct*100}%`,background:"#E24B4A",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:500}}>
                    {model.investorPct>0.05?`SAFE ${pct(model.investorPct)}`:""}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab==="Scenarios" && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
                {["bear","base","bull","investor"].map(s=>{
                  const mod = scenarioMods[s];
                  const active = inputs.scenario===s;
                  return (
                    <button key={s} onClick={()=>set("scenario",s)}
                      style={{padding:"12px",borderRadius:"var(--border-radius-lg)",textAlign:"left",cursor:"pointer",
                        background:active?"var(--color-background-info)":"var(--color-background-secondary)",
                        border:active?"0.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)"}}>
                      <div style={{fontSize:13,fontWeight:500,marginBottom:4,color:active?"var(--color-text-info)":"var(--color-text-primary)",textTransform:"capitalize"}}>
                        {s==="investor"?"Investor demo":s}
                      </div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{pct(Math.abs(mod.growthMod-1))} {mod.growthMod>=1?"boost":"cut"}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{mod.churnMod>1?"Higher":"Lower"} churn ×{mod.churnMod}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
                {card("ARR — year 1", fmt(model.m12.arr),"month 12")}
                {card("ARR — year 3", fmt(model.m36.arr),"month 36")}
                {card("Runway", model.runway===36?"36+ mo":mo(model.runway),"this scenario")}
                {card("LTV:CAC", x(model.ltvcac),"this scenario", scoreColor(model.ltvcac,3,1.5))}
                {card("Burn multiple", model.finalBurnMultiple>10?"10x+":x(model.finalBurnMultiple),"yr 3", burnLabel(model.finalBurnMultiple).color)}
                {card("Funding gap", model.fundingGap>0?fmt(model.fundingGap):"None","36 mo", model.fundingGap===0?"var(--color-text-success)":"var(--color-text-danger)")}
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"14px 16px"}}>
                <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>ARR — {inputs.scenario} scenario</div>
                <MilestoneChart data={model.months} valueKey="arr" color="#378ADD" height={160} milestones={milestones} />
              </div>
            </>
          )}
        </div>
        {sidePanel}
      </div>
    </div>
  );
}
