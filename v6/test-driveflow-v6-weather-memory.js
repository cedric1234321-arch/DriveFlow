const assert=require('assert');
const WX=require('./driveflow-v6-weather.js');

const rows=[
  {time:'2026-08-20T17:00',temperature:22,apparentTemperature:22,precipitation:0,rain:0,weatherCode:2,windSpeed:8,windGusts:15},
  {time:'2026-08-20T18:00',temperature:21,apparentTemperature:21,precipitation:0.1,rain:0.1,weatherCode:51,windSpeed:9,windGusts:18},
  {time:'2026-08-20T19:00',temperature:20,apparentTemperature:20,precipitation:0,rain:0,weatherCode:3,windSpeed:8,windGusts:16},
  {time:'2026-08-20T20:00',temperature:20,apparentTemperature:20,precipitation:0,rain:0,weatherCode:3,windSpeed:7,windGusts:14},
  {time:'2026-08-20T21:00',temperature:19,apparentTemperature:19,precipitation:0,rain:0,weatherCode:2,windSpeed:6,windGusts:12}
];
const lightSoon=WX.aggregateInterval(rows,'2026-08-20T18:15','2026-08-20T19:00');
const lightLater=WX.aggregateInterval(rows,'2026-08-20T20:00','2026-08-20T20:45');
assert(lightSoon.wetRoadIndex>lightLater.wetRoadIndex,'light-rain wet-road effect should decay');
assert(lightLater.wetRoadIndex<0.12,'light drizzle should not create a long residual rain factor');

const heavy=[
  {time:'2026-08-20T16:00',temperature:22,apparentTemperature:22,precipitation:0,rain:0,weatherCode:2,windSpeed:8,windGusts:15},
  {time:'2026-08-20T17:00',temperature:20,apparentTemperature:20,precipitation:9,rain:9,weatherCode:65,windSpeed:15,windGusts:35},
  {time:'2026-08-20T18:00',temperature:19,apparentTemperature:19,precipitation:0,rain:0,weatherCode:3,windSpeed:10,windGusts:20},
  {time:'2026-08-20T19:00',temperature:19,apparentTemperature:19,precipitation:0,rain:0,weatherCode:3,windSpeed:8,windGusts:16},
  {time:'2026-08-20T20:00',temperature:19,apparentTemperature:19,precipitation:0,rain:0,weatherCode:2,windSpeed:7,windGusts:14}
];
const heavyAfter=WX.aggregateInterval(heavy,'2026-08-20T18:00','2026-08-20T19:00');
const heavyTwoHours=WX.aggregateInterval(heavy,'2026-08-20T19:00','2026-08-20T20:00');
assert.equal(heavyAfter.rainMm,0,'the session itself is dry');
assert(heavyAfter.wetRoadActive,'heavy prior rain should keep residual wet-road context');
assert(heavyTwoHours.wetRoadIndex>0.12,'heavy rain should still matter roughly two hours later');
assert(heavyAfter.wetRoadIndex>heavyTwoHours.wetRoadIndex,'heavy-rain residual effect should still decay over time');

console.log('DriveFlow V6 rain-memory tests passed');