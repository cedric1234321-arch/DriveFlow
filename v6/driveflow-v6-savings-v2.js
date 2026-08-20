(() => {
"use strict";

const DF = typeof module !== "undefined" && module.exports
  ? require("./driveflow-v6-core.js")
  : globalThis.DriveFlowV6Core;

const S = {};
S.hasOwn = (o,k) => Object.prototype.hasOwnProperty.call(o||{},k);

/* A fixed daily savings value is a target, not a hard cap on what a good day can
   contribute to the following day. Surplus from an earlier day may cover a later
   shortfall, but a later surplus never repairs an earlier missed target. */
S.computeFixedDaily = ({ dates = [], dayRows = [], defaultValue = 0, overrides = {} }) => {
  const byDate = new Map((dayRows||[]).map(x => [x.date,x]));
  let carry = 0, target = 0, saved = 0;
  const daily = [];
  for (const date of dates || []) {
    const row = byDate.get(date) || { date, netFinal:0, worked:false };
    const worked = row.worked === true || !!row.sessions || Number(row.ca) > 0;
    const explicit = S.hasOwn(overrides,date);
    const dayTarget = Math.max(0,DF.n(explicit ? overrides[date] : (worked ? defaultValue : 0)));
    const net = Math.max(0,DF.n(row.netFinal));
    let fulfilled = 0;
    const carryBefore = carry;

    if (dayTarget > 0) {
      if (net >= dayTarget) {
        fulfilled = dayTarget;
        carry += net - dayTarget;
      } else {
        const deficit = dayTarget - net;
        const fromCarry = Math.min(carry,deficit);
        fulfilled = net + fromCarry;
        carry -= fromCarry;
      }
    }

    target += dayTarget;
    saved += fulfilled;
    daily.push({date,target:dayTarget,fulfilled,net,explicit,worked,carryBefore,carryAfter:carry});
  }
  return {
    target:DF.round2(target),
    saved:DF.round2(saved),
    remaining:DF.round2(Math.max(0,target-saved)),
    advance:DF.round2(Math.max(0,carry)),
    daily
  };
};

const DATA = typeof globalThis !== "undefined" ? globalThis.DriveFlowV6Data : null;
if (DATA && DF) {
  const originalAggregate = DATA.aggregateDates.bind(DATA);
  DATA.aggregateDates = (state,ctx,dates) => {
    const out = originalAggregate(state,ctx,dates);
    const first = dates?.[0] || DATA.businessToday();
    const rule = DF.resolveSavingsRule({
      defaultRule:state.settings?.defaultSavingsRule,
      weeklyOverrides:state.settings?.weeklySavingsOverrides
    },first);
    if (rule.mode !== "fixed_daily") return out;

    const rows = (dates||[]).map(date => {
      const d = DATA.dayMetrics(state,ctx,date);
      return {date,netFinal:d.netFinal,ca:d.ca,sessions:d.sessions?.length||0,worked:!!(d.sessions?.length||d.ca)};
    });
    const result = S.computeFixedDaily({
      dates,
      dayRows:rows,
      defaultValue:rule.value,
      overrides:state.settings?.dailySavingsOverrides||{}
    });
    out.savingsRule = {...rule};
    out.savings = {
      target:result.target,
      saved:result.saved,
      remaining:result.remaining,
      availableAfterSavings:Math.max(0,DF.n(out.netFinal)-result.saved),
      reached:result.target===0?null:result.saved>=result.target,
      advance:result.advance,
      daily:result.daily
    };
    return out;
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = S;
else globalThis.DriveFlowV6SavingsV2 = S;
})();
