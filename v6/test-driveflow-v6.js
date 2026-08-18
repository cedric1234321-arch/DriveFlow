const assert = require('assert');
const DF = require('./driveflow-v6-core.js');
const INT = require('./driveflow-v6-intelligence.js');

const noUrssaf = DF.financialMetrics({ca:100,fuel:15,urssafEnabled:false,urssafRatePct:21.2});
assert.equal(DF.round2(noUrssaf.netFinal),85);

const standard = DF.financialMetrics({ca:100,fuel:15,urssafEnabled:true,urssafRatePct:21.2});
assert.equal(DF.round2(standard.urssaf),21.2);
assert.equal(DF.round2(standard.netFinal),63.8);

const daily = DF.savingsForPeriod({netAvailable:100,rule:{mode:'fixed_daily',value:25},workedDays:3});
assert.equal(daily.target,75);
assert.equal(daily.saved,75);

const percent = DF.savingsForPeriod({netAvailable:100,rule:{mode:'percent_net',value:40},workedDays:3});
assert.equal(percent.target,40);
assert.equal(percent.saved,40);

const sessions=[];
for(let i=0;i<80;i++){
  const weekday=i%7;
  sessions.push({
    id:`s${i}`,
    dateDays:i,
    weekday,
    startHour:weekday>=4?19+(i%3)*0.1:18.5+(i%4)*0.1,
    hours:2.5+(i%3)*0.5,
    caHourly:13+(weekday>=4?3:0)+(i%5)*0.5,
    kmHourly:10+(i%4),
    timeQuality:i%4===0?'exact':i%5===0?'partial':'estimated'
  });
}
const target={date:'2026-08-21',dateDays:100,weekday:4,startHour:19,hours:3};
const financialContext={
  fuelPriceHistory:[{effectiveFrom:'2026-01-01',pricePerL:1.8}],
  consumptionHistory:[{effectiveFrom:'2026-01-01',litresPer100km:5.5}],
  urssafEnabled:true,
  urssafRatePct:21.2,
  urssafRateHistory:[]
};
const forecast=INT.forecastSession(sessions,target,financialContext);
assert.equal(forecast.status,'ok');
assert(forecast.expectedCa>30 && forecast.expectedCa<70);
assert(forecast.netFinal<forecast.netAfterFuel);

assert.equal(INT.candidatesOverlap(
  {date:'2026-08-21',startHour:18,hours:3},
  {date:'2026-08-21',startHour:19,hours:3}
),true);
assert.equal(INT.candidatesOverlap(
  {date:'2026-08-21',startHour:12,hours:2},
  {date:'2026-08-21',startHour:18,hours:3}
),false);

const candidates=[];
for(let d=0;d<5;d++){
  const date=`2026-08-${21+d}`;
  const weekday=(4+d)%7;
  candidates.push({id:`eveA${d}`,date,dateDays:100+d,weekday,startHour:18,hours:3});
  candidates.push({id:`eveB${d}`,date,dateDays:100+d,weekday,startHour:19,hours:3}); // overlaps eveA
  candidates.push({id:`mid${d}`,date,dateDays:100+d,weekday,startHour:12,hours:2});
}
const plan=INT.planWeek({
  sessions,
  candidates,
  financialContext:{...financialContext,urssafEnabled:false},
  caGoal:120,
  savingsGoal:80,
  priority:'min_time',
  targetProbability:.60,
  simulationRuns:300
});
assert(plan.selected.length>0);
assert(plan.expectedCa>0);
assert(plan.simulationRuns>=100);
assert(plan.caGoalProbability>=0 && plan.caGoalProbability<=1);
assert(plan.savingsGoalProbability>=0 && plan.savingsGoalProbability<=1);
for(let i=0;i<plan.selected.length;i++){
  for(let j=i+1;j<plan.selected.length;j++){
    assert.equal(INT.candidatesOverlap(plan.selected[i],plan.selected[j]),false,'planner selected overlapping sessions');
  }
}
assert(plan.caRange.low<=plan.caRange.median && plan.caRange.median<=plan.caRange.high);

console.log('DriveFlow V6 smoke tests passed');