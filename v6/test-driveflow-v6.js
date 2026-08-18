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
for(let i=0;i<30;i++) sessions.push({id:`s${i}`,dateDays:i,weekday:4,startHour:19+(i%3)*0.1,hours:3,caHourly:15+(i%4),kmHourly:12,timeQuality:i%4===0?'exact':'estimated'});
const target={date:'2026-08-21',dateDays:40,weekday:4,startHour:19,hours:3};
const financialContext={
  fuelPriceHistory:[{effectiveFrom:'2026-01-01',pricePerL:1.8}],
  consumptionHistory:[{effectiveFrom:'2026-01-01',litresPer100km:5.5}],
  urssafEnabled:true,
  urssafRatePct:21.2
};
const forecast=INT.forecastSession(sessions,target,financialContext);
assert.equal(forecast.status,'ok');
assert(forecast.expectedCa>40 && forecast.expectedCa<60);
assert(forecast.netFinal<forecast.netAfterFuel);

const candidates=[0,1,2,3].map(x=>({...target,id:`c${x}`,date:`2026-08-${21+x}`,dateDays:40+x,weekday:(4+x)%7,startHour:19,hours:3}));
const plan=INT.planWeek({sessions,candidates,financialContext:{...financialContext,urssafEnabled:false},caGoal:100,savingsGoal:70,priority:'min_time'});
assert(plan.selected.length>0);
assert(plan.expectedCa>0);

console.log('DriveFlow V6 smoke tests passed');