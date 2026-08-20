const assert=require('assert');
const R=require('./driveflow-v6-review-rules.js');

assert.equal(R.heatTier(13.01),'red');
assert.equal(R.heatTier(13),'orange');
assert.equal(R.heatTier(12),'orange');
assert.equal(R.heatTier(11.99),'green');
assert.equal(R.heatTier(10.5),'green');
assert.equal(R.heatTier(10.49),'white');
assert.equal(R.isoWeekDisplay('2026-W34'),'S34 – 2026');

let x=R.dailySavingsSchedule({
  dates:['2026-08-17','2026-08-18'],
  daysByDate:{
    '2026-08-17':{worked:true,netFinal:30},
    '2026-08-18':{worked:true,netFinal:20}
  },
  rule:{mode:'fixed_daily',value:25},dailyOverrides:{}
});
assert.equal(x.target,50);
assert.equal(x.saved,50,'Monday surplus must be allowed to fund Tuesday');
assert.equal(x.details[0].carryOut,5);
assert.equal(x.details[1].credited,25);

x=R.dailySavingsSchedule({
  dates:['2026-08-17','2026-08-18'],
  daysByDate:{
    '2026-08-17':{worked:true,netFinal:20},
    '2026-08-18':{worked:true,netFinal:30}
  },
  rule:{mode:'fixed_daily',value:25},dailyOverrides:{}
});
assert.equal(x.target,50);
assert.equal(x.saved,45,'Tuesday surplus must not retroactively repair Monday');
assert.equal(x.details[0].credited,20);
assert.equal(x.details[1].credited,25);
assert.equal(x.details[1].carryOut,5,'Tuesday surplus may still carry forward to a later day');

x=R.dailySavingsSchedule({
  dates:['2026-08-19','2026-08-20'],
  daysByDate:{'2026-08-19':{worked:false,netFinal:0},'2026-08-20':{worked:false,netFinal:0}},
  rule:{mode:'fixed_daily',value:25},dailyOverrides:{'2026-08-19':0,'2026-08-20':40}
});
assert.equal(x.details[0].target,0);
assert.equal(x.details[1].target,40,'an explicit future daily goal must count even before the day is worked');

console.log('DriveFlow V6 review rules tests passed');
