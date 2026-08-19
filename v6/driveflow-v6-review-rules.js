(() => {
"use strict";

const R={};
R.n=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
R.heatTier=v=>{
  const x=R.n(v);
  if(x>13.5)return"red";
  if(x>=12)return"orange";
  if(x>=10)return"green";
  return"white";
};
R.isoWeekDisplay=key=>{
  const m=String(key||"").match(/^(\d{4})-W(\d{1,2})$/);
  return m?`S${Number(m[2])} – ${m[1]}`:String(key||"");
};
R.dailySavingsSchedule=({dates=[],daysByDate={},rule={mode:"fixed_daily",value:25},dailyOverrides={}}={})=>{
  if(rule?.mode!=="fixed_daily")return null;
  const defaultValue=Math.max(0,R.n(rule.value));
  let carry=0,target=0,saved=0;
  const details=[];
  for(const date of dates){
    const day=daysByDate[date]||{};
    const explicit=Object.prototype.hasOwnProperty.call(dailyOverrides||{},date);
    const dayTarget=explicit?Math.max(0,R.n(dailyOverrides[date])):((day.worked||R.n(day.ca)>0)?defaultValue:0);
    const net=Math.max(0,R.n(day.netFinal));
    const carryIn=carry;
    const available=net+carryIn;
    const credited=Math.min(dayTarget,available);
    // Only surplus from an earlier/this day can help later days. A later day never
    // retroactively repairs a deficit from a previous day.
    carry=Math.max(0,available-dayTarget);
    target+=dayTarget;saved+=credited;
    details.push({date,target:dayTarget,net,credited,carryIn,carryOut:carry,explicit});
  }
  return{target,saved,remaining:Math.max(0,target-saved),carryForward:carry,reached:target===0?null:saved>=target,details};
};

if(typeof module!=="undefined"&&module.exports)module.exports=R;
else globalThis.DriveFlowV6ReviewRules=R;
})();
